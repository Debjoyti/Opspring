-- Invoices with a payments ledger, and public (tokenized) quote acceptance.
-- Same RLS pattern as everything else; the two SECURITY DEFINER functions at
-- the bottom are the deliberate, narrow exception that powers /q/<token>.

-- Invoices ---------------------------------------------------------------------
create table public.crm_invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  number int not null,
  title text not null,
  quote_id uuid references public.crm_quotes (id) on delete set null,
  deal_id uuid references public.crm_deals (id) on delete set null,
  account_id uuid references public.crm_accounts (id) on delete set null,
  contact_id uuid references public.crm_contacts (id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'partially_paid', 'paid', 'void')),
  currency text not null default 'USD',
  discount_pct numeric(5, 2) not null default 0 check (discount_pct between 0 and 100),
  tax_rate numeric(5, 2) not null default 0 check (tax_rate between 0 and 100),
  issue_date date not null default current_date,
  due_date date,
  paid_total numeric(14, 2) not null default 0,
  notes text,
  terms text,
  sent_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  owner_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index crm_invoices_number_idx on public.crm_invoices (org_id, number);
create index crm_invoices_org_idx on public.crm_invoices (org_id, created_at desc);

create or replace function public.crm_next_invoice_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.number is null or new.number = 0 then
    select coalesce(max(number), 0) + 1
    into new.number
    from public.crm_invoices
    where org_id = new.org_id;
  end if;
  return new;
end;
$$;
revoke execute on function public.crm_next_invoice_number() from public, anon, authenticated;

create trigger crm_invoices_number
  before insert on public.crm_invoices
  for each row execute function public.crm_next_invoice_number();

create table public.crm_invoice_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  invoice_id uuid not null references public.crm_invoices (id) on delete cascade,
  product_id uuid references public.crm_products (id) on delete set null,
  description text not null,
  quantity numeric(12, 2) not null default 1 check (quantity > 0),
  unit_price numeric(14, 2) not null default 0,
  discount_pct numeric(5, 2) not null default 0 check (discount_pct between 0 and 100),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index crm_invoice_items_invoice_idx on public.crm_invoice_items (invoice_id, position);

-- Payments ledger ----------------------------------------------------------------
create table public.crm_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  invoice_id uuid not null references public.crm_invoices (id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  method text not null default 'bank_transfer'
    check (method in ('bank_transfer', 'card', 'cash', 'check', 'other')),
  reference text,
  notes text,
  paid_at timestamptz not null default now(),
  actor_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index crm_payments_invoice_idx on public.crm_payments (invoice_id, paid_at desc);

-- Invoice total, mirroring src/lib/services/crm/quotes.ts quoteTotals()
-- exactly (per-line rounding, then subtotal, discount, tax) so SQL and JS
-- never disagree about whether an invoice is fully paid.
create or replace function public.crm_invoice_total(p_invoice_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  with lines as (
    select round(quantity * unit_price * (1 - discount_pct / 100), 2) as line_total
    from public.crm_invoice_items
    where invoice_id = p_invoice_id
  ),
  sub as (
    select round(coalesce(sum(line_total), 0), 2) as subtotal
    from lines
  ),
  quote as (
    select i.discount_pct, i.tax_rate
    from public.crm_invoices i
    where i.id = p_invoice_id
  )
  select round(
    round(sub.subtotal - round(sub.subtotal * quote.discount_pct / 100, 2), 2)
    + round(
        round(sub.subtotal - round(sub.subtotal * quote.discount_pct / 100, 2), 2)
        * quote.tax_rate / 100, 2),
    2)
  from sub, quote;
$$;
revoke execute on function public.crm_invoice_total(uuid) from public, anon;
grant execute on function public.crm_invoice_total(uuid) to authenticated;

-- Payments drive paid_total and the sent -> partially_paid -> paid moves.
create or replace function public.crm_recalc_invoice_paid()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_invoice_id uuid := coalesce(new.invoice_id, old.invoice_id);
  v_paid numeric;
  v_total numeric;
begin
  select coalesce(sum(amount), 0) into v_paid
  from public.crm_payments
  where invoice_id = v_invoice_id;

  v_total := public.crm_invoice_total(v_invoice_id);

  update public.crm_invoices
  set paid_total = v_paid,
      status = case
        when status in ('draft', 'void') then status
        when v_paid <= 0 then 'sent'
        when v_paid >= v_total then 'paid'
        else 'partially_paid'
      end,
      paid_at = case when v_paid >= v_total and v_paid > 0 then coalesce(paid_at, now()) end
  where id = v_invoice_id;
  return coalesce(new, old);
end;
$$;
revoke execute on function public.crm_recalc_invoice_paid() from public, anon, authenticated;

create trigger crm_payments_recalc
  after insert or update or delete on public.crm_payments
  for each row execute function public.crm_recalc_invoice_paid();

create trigger crm_invoices_updated before update on public.crm_invoices
  for each row execute function public.set_updated_at();

-- Public quote acceptance ----------------------------------------------------------
alter table public.crm_quotes
  add column public_token uuid not null default gen_random_uuid();
create unique index crm_quotes_token_idx on public.crm_quotes (public_token);

-- Customer-facing read: token in, one quote out (never drafts, never other
-- rows, no org enumeration). SECURITY DEFINER is the point — the caller is
-- anonymous. The 128-bit random token is the credential.
create or replace function public.crm_quote_public(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_quote public.crm_quotes;
  v_org_name text;
  v_account_name text;
  v_items jsonb;
begin
  select * into v_quote
  from public.crm_quotes
  where public_token = p_token
    and status in ('sent', 'accepted', 'declined', 'expired');
  if not found then
    return null;
  end if;

  select name into v_org_name from public.organizations where id = v_quote.org_id;
  select name into v_account_name from public.crm_accounts where id = v_quote.account_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'description', description,
    'quantity', quantity,
    'unit_price', unit_price,
    'discount_pct', discount_pct
  ) order by position, created_at), '[]'::jsonb)
  into v_items
  from public.crm_quote_items
  where quote_id = v_quote.id;

  return jsonb_build_object(
    'number', v_quote.number,
    'title', v_quote.title,
    'status', v_quote.status,
    'currency', v_quote.currency,
    'discount_pct', v_quote.discount_pct,
    'tax_rate', v_quote.tax_rate,
    'valid_until', v_quote.valid_until,
    'notes', v_quote.notes,
    'terms', v_quote.terms,
    'created_at', v_quote.created_at,
    'org_name', v_org_name,
    'account_name', v_account_name,
    'items', v_items
  );
end;
$$;
revoke execute on function public.crm_quote_public(uuid) from public;
grant execute on function public.crm_quote_public(uuid) to anon, authenticated;

-- Customer accept/decline: only a 'sent' quote can be answered, exactly once.
create or replace function public.crm_quote_respond(p_token uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.crm_quotes;
begin
  select * into v_quote
  from public.crm_quotes
  where public_token = p_token
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_quote.status <> 'sent' then
    return jsonb_build_object('ok', false, 'error', 'not_open', 'status', v_quote.status);
  end if;

  update public.crm_quotes
  set status = case when p_accept then 'accepted' else 'declined' end,
      accepted_at = case when p_accept then now() end,
      declined_at = case when p_accept then null else now() end
  where id = v_quote.id;

  insert into public.crm_activities (org_id, type, subject, related_type, related_id, done)
  values (
    v_quote.org_id,
    'note',
    'Quote Q-' || lpad(v_quote.number::text, 4, '0')
      || case when p_accept then ' accepted' else ' declined' end
      || ' by customer',
    case
      when v_quote.deal_id is not null then 'deal'
      when v_quote.account_id is not null then 'account'
    end,
    coalesce(v_quote.deal_id, v_quote.account_id),
    true
  );

  return jsonb_build_object(
    'ok', true,
    'status', case when p_accept then 'accepted' else 'declined' end
  );
end;
$$;
revoke execute on function public.crm_quote_respond(uuid, boolean) from public;
grant execute on function public.crm_quote_respond(uuid, boolean) to anon, authenticated;

-- RLS + grants for the new tables ------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['crm_invoices', 'crm_invoice_items', 'crm_payments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (org_id = any (private.jwt_org_ids())) with check (org_id = any (private.jwt_org_ids()))',
      t || '_org_isolation', t
    );
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
