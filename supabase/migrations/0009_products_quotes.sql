-- Products catalog, deal line items, quotes, and email templates. Same RLS
-- pattern as everything else (private.jwt_org_ids(), never USING (true)),
-- explicit grants, and explicit revokes on new public functions.

-- Products --------------------------------------------------------------------
create table public.crm_products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  sku text,
  description text,
  unit_price numeric(14, 2) not null default 0,
  currency text not null default 'USD',
  billing_interval text not null default 'one_time'
    check (billing_interval in ('one_time', 'monthly', 'yearly')),
  active boolean not null default true,
  tags text[] not null default '{}',
  owner_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crm_products_org_idx on public.crm_products (org_id, created_at desc);
create unique index crm_products_sku_idx on public.crm_products (org_id, sku)
  where sku is not null;
create index crm_products_tags_idx on public.crm_products using gin (tags);

-- Deal line items --------------------------------------------------------------
create table public.crm_deal_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  deal_id uuid not null references public.crm_deals (id) on delete cascade,
  product_id uuid references public.crm_products (id) on delete set null,
  description text not null,
  quantity numeric(12, 2) not null default 1 check (quantity > 0),
  unit_price numeric(14, 2) not null default 0,
  discount_pct numeric(5, 2) not null default 0 check (discount_pct between 0 and 100),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index crm_deal_items_deal_idx on public.crm_deal_items (deal_id, position);

-- Keep the deal's amount in sync with its line items. Only touches the deal
-- when it still has items — deleting the last item returns the deal to
-- manual-amount mode instead of zeroing it.
create or replace function public.crm_recalc_deal_amount()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_deal_id uuid := coalesce(new.deal_id, old.deal_id);
  v_total numeric;
begin
  select sum(quantity * unit_price * (1 - discount_pct / 100))
  into v_total
  from public.crm_deal_items
  where deal_id = v_deal_id;

  if v_total is not null then
    update public.crm_deals set amount = round(v_total, 2) where id = v_deal_id;
  end if;
  return coalesce(new, old);
end;
$$;
revoke execute on function public.crm_recalc_deal_amount() from public, anon, authenticated;

create trigger crm_deal_items_recalc
  after insert or update or delete on public.crm_deal_items
  for each row execute function public.crm_recalc_deal_amount();

-- Quotes ------------------------------------------------------------------------
create table public.crm_quotes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  number int not null,
  title text not null,
  deal_id uuid references public.crm_deals (id) on delete set null,
  account_id uuid references public.crm_accounts (id) on delete set null,
  contact_id uuid references public.crm_contacts (id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'accepted', 'declined', 'expired')),
  currency text not null default 'USD',
  discount_pct numeric(5, 2) not null default 0 check (discount_pct between 0 and 100),
  tax_rate numeric(5, 2) not null default 0 check (tax_rate between 0 and 100),
  valid_until date,
  notes text,
  terms text,
  sent_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  owner_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index crm_quotes_number_idx on public.crm_quotes (org_id, number);
create index crm_quotes_org_idx on public.crm_quotes (org_id, created_at desc);

-- Per-org sequential quote numbers. max+1 under the org-scoped unique index:
-- a concurrent clash errors instead of silently duplicating (fine at this
-- scale; swap for a sequence table if quote volume ever makes retries hurt).
create or replace function public.crm_next_quote_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.number is null or new.number = 0 then
    select coalesce(max(number), 0) + 1
    into new.number
    from public.crm_quotes
    where org_id = new.org_id;
  end if;
  return new;
end;
$$;
revoke execute on function public.crm_next_quote_number() from public, anon, authenticated;

create trigger crm_quotes_number
  before insert on public.crm_quotes
  for each row execute function public.crm_next_quote_number();

create table public.crm_quote_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  quote_id uuid not null references public.crm_quotes (id) on delete cascade,
  product_id uuid references public.crm_products (id) on delete set null,
  description text not null,
  quantity numeric(12, 2) not null default 1 check (quantity > 0),
  unit_price numeric(14, 2) not null default 0,
  discount_pct numeric(5, 2) not null default 0 check (discount_pct between 0 and 100),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index crm_quote_items_quote_idx on public.crm_quote_items (quote_id, position);

-- Email templates -----------------------------------------------------------------
create table public.crm_email_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  subject text not null,
  body text not null,
  owner_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crm_email_templates_org_idx on public.crm_email_templates (org_id, created_at desc);

-- updated_at maintenance ------------------------------------------------------------
create trigger crm_products_updated before update on public.crm_products
  for each row execute function public.set_updated_at();
create trigger crm_quotes_updated before update on public.crm_quotes
  for each row execute function public.set_updated_at();
create trigger crm_email_templates_updated before update on public.crm_email_templates
  for each row execute function public.set_updated_at();

-- Search support: trigram indexes for fast ILIKE across the searched columns.
create extension if not exists pg_trgm;
create index crm_leads_name_trgm on public.crm_leads using gin (name gin_trgm_ops);
create index crm_accounts_name_trgm on public.crm_accounts using gin (name gin_trgm_ops);
create index crm_contacts_name_trgm on public.crm_contacts
  using gin ((first_name || ' ' || coalesce(last_name, '')) gin_trgm_ops);
create index crm_deals_name_trgm on public.crm_deals using gin (name gin_trgm_ops);
create index crm_products_name_trgm on public.crm_products using gin (name gin_trgm_ops);
create index crm_quotes_title_trgm on public.crm_quotes using gin (title gin_trgm_ops);

-- RLS + grants for the new tables ------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'crm_products', 'crm_deal_items', 'crm_quotes', 'crm_quote_items', 'crm_email_templates'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (org_id = any (private.jwt_org_ids())) with check (org_id = any (private.jwt_org_ids()))',
      t || '_org_isolation', t
    );
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
