-- CRM module: accounts, contacts, leads, deals, activities.
-- Every table is org-scoped with the same real-RLS pattern as the foundation
-- (private.jwt_org_ids(), never USING (true)), plus explicit grants.

create type public.crm_lead_status as enum (
  'new', 'contacted', 'qualified', 'unqualified', 'converted'
);
create type public.crm_deal_stage as enum (
  'qualified', 'proposal', 'negotiation', 'won', 'lost'
);
create type public.crm_activity_type as enum (
  'call', 'email', 'meeting', 'note', 'task'
);

-- Accounts (customer companies) --------------------------------------------
create table public.crm_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  industry text,
  website text,
  phone text,
  owner_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crm_accounts_org_idx on public.crm_accounts (org_id, created_at desc);

-- Contacts (people) ---------------------------------------------------------
create table public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  account_id uuid references public.crm_accounts (id) on delete set null,
  first_name text not null,
  last_name text,
  email text,
  phone text,
  title text,
  owner_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crm_contacts_org_idx on public.crm_contacts (org_id, created_at desc);
create index crm_contacts_account_idx on public.crm_contacts (account_id);

-- Leads (top of funnel) -----------------------------------------------------
create table public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  company text,
  email text,
  phone text,
  source text,
  status public.crm_lead_status not null default 'new',
  owner_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crm_leads_org_idx on public.crm_leads (org_id, created_at desc);
create index crm_leads_status_idx on public.crm_leads (org_id, status);

-- Deals (pipeline) ----------------------------------------------------------
create table public.crm_deals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  account_id uuid references public.crm_accounts (id) on delete set null,
  contact_id uuid references public.crm_contacts (id) on delete set null,
  amount numeric(14, 2) not null default 0,
  currency text not null default 'USD',
  stage public.crm_deal_stage not null default 'qualified',
  close_date date,
  owner_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crm_deals_org_idx on public.crm_deals (org_id, created_at desc);
create index crm_deals_stage_idx on public.crm_deals (org_id, stage);

-- Activities (calls/emails/meetings/notes/tasks) ----------------------------
create table public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  type public.crm_activity_type not null default 'note',
  subject text not null,
  notes text,
  related_type text check (related_type in ('lead', 'account', 'contact', 'deal')),
  related_id uuid,
  due_at timestamptz,
  done boolean not null default false,
  actor_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index crm_activities_org_idx on public.crm_activities (org_id, created_at desc);
create index crm_activities_related_idx on public.crm_activities (related_type, related_id);

-- updated_at maintenance ----------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger crm_accounts_updated before update on public.crm_accounts
  for each row execute function public.set_updated_at();
create trigger crm_contacts_updated before update on public.crm_contacts
  for each row execute function public.set_updated_at();
create trigger crm_leads_updated before update on public.crm_leads
  for each row execute function public.set_updated_at();
create trigger crm_deals_updated before update on public.crm_deals
  for each row execute function public.set_updated_at();

-- RLS: scope every table to the caller's orgs via the JWT claim / fallback.
do $$
declare t text;
begin
  foreach t in array array[
    'crm_accounts', 'crm_contacts', 'crm_leads', 'crm_deals', 'crm_activities'
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
