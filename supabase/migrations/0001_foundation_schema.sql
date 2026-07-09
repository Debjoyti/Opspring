-- Foundation: organizations, memberships, RBAC roles, audit log.
-- Tenant isolation is enforced by real RLS policies reading JWT claims
-- (private.jwt_org_ids / private.jwt_role_for_org), not by app-code filtering.

create schema if not exists private;

create type public.org_role as enum ('owner', 'admin', 'manager', 'member', 'guest');
create type public.membership_status as enum ('active', 'invited', 'suspended');

-- Organizations: the tenant root.
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index organizations_slug_key on public.organizations (slug) where deleted_at is null;

-- Memberships: the only identity/tenancy join. A user can belong to many orgs.
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  role public.org_role not null default 'member',
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index memberships_user_org_key on public.memberships (user_id, org_id) where deleted_at is null;
create index memberships_org_id_idx on public.memberships (org_id) where deleted_at is null;

-- Audit log: written only by the trigger below, never directly by app code.
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_org_id_idx on public.audit_log (org_id, created_at desc);

create or replace function private.log_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (org_id, actor_id, action, entity, entity_id, metadata)
  values (
    coalesce(new.org_id, old.org_id),
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(new.id, old.id),
    case tg_op when 'DELETE' then to_jsonb(old) else to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create trigger organizations_audit
after insert or update or delete on public.organizations
for each row execute function private.log_audit_event();

create trigger memberships_audit
after insert or update or delete on public.memberships
for each row execute function private.log_audit_event();

-- JWT claim helpers. The `org_roles` claim (org_id -> role map) is populated
-- by the custom_access_token_hook in the next migration.
create or replace function private.jwt_org_roles()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'org_roles', '{}'::jsonb)
$$;

create or replace function private.jwt_org_ids()
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array(select jsonb_object_keys(private.jwt_org_roles()))::uuid[], array[]::uuid[])
$$;

create or replace function private.jwt_role_for_org(p_org_id uuid)
returns public.org_role
language sql
stable
set search_path = ''
as $$
  select (private.jwt_org_roles() ->> p_org_id::text)::public.org_role
$$;

grant usage on schema private to authenticated;
grant execute on function private.jwt_org_roles() to authenticated;
grant execute on function private.jwt_org_ids() to authenticated;
grant execute on function private.jwt_role_for_org(uuid) to authenticated;

-- Atomic signup: create an org and its first membership (owner) in one
-- transaction, bypassing RLS via SECURITY DEFINER (no two-step app-code insert).
create or replace function public.create_organization_with_owner(p_name text, p_slug text)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
begin
  insert into public.organizations (name, slug)
  values (p_name, p_slug)
  returning * into v_org;

  insert into public.memberships (user_id, org_id, role, status)
  values (auth.uid(), v_org.id, 'owner', 'active');

  return v_org;
end;
$$;

revoke all on function public.create_organization_with_owner(text, text) from public;
grant execute on function public.create_organization_with_owner(text, text) to authenticated;

-- Real RLS: every policy scopes to orgs present in the caller's JWT claims.
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.audit_log enable row level security;

create policy "members can view their orgs" on public.organizations
for select to authenticated
using (id = any (private.jwt_org_ids()));

create policy "owners and admins can update their org" on public.organizations
for update to authenticated
using (id = any (private.jwt_org_ids()) and private.jwt_role_for_org(id) in ('owner', 'admin'))
with check (id = any (private.jwt_org_ids()) and private.jwt_role_for_org(id) in ('owner', 'admin'));

create policy "members can view memberships in their orgs" on public.memberships
for select to authenticated
using (org_id = any (private.jwt_org_ids()));

create policy "owners and admins can manage memberships in their org" on public.memberships
for all to authenticated
using (org_id = any (private.jwt_org_ids()) and private.jwt_role_for_org(org_id) in ('owner', 'admin'))
with check (org_id = any (private.jwt_org_ids()) and private.jwt_role_for_org(org_id) in ('owner', 'admin'));

create policy "members can view audit log for their org" on public.audit_log
for select to authenticated
using (org_id = any (private.jwt_org_ids()));

-- Defense in depth: no default grants, even with real RLS in place.
revoke all on all tables in schema public from anon, authenticated;
grant select, update on public.organizations to authenticated;
grant select, insert, update, delete on public.memberships to authenticated;
grant select on public.audit_log to authenticated;
