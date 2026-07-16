-- Make tenant RLS resilient when the Supabase custom access-token hook has
-- not been enabled yet. Prefer the fast JWT org_roles claim when present, but
-- fall back to active memberships for the signed-in user.

create or replace function private.active_org_roles_for_user(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(m.org_id::text, m.role), '{}'::jsonb)
  from public.memberships m
  where m.user_id = p_user_id
    and m.deleted_at is null
    and m.status = 'active'
$$;

create or replace function private.jwt_org_roles()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.jwt() -> 'org_roles' is not null
      and auth.jwt() -> 'org_roles' <> '{}'::jsonb
      then auth.jwt() -> 'org_roles'
    when auth.uid() is not null
      then private.active_org_roles_for_user(auth.uid())
    else '{}'::jsonb
  end
$$;

grant execute on function private.active_org_roles_for_user(uuid) to authenticated;
grant execute on function private.jwt_org_roles() to authenticated;
