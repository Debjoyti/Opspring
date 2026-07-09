-- Injects an `org_roles` claim (org_id -> role map) into every issued JWT,
-- sourced from active memberships. Must be enabled manually in the Supabase
-- Dashboard: Authentication > Hooks > Customize Access Token (JWT) Claims Hook.
-- See ARCHITECTURE.md.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  claims jsonb;
  org_roles jsonb;
begin
  select coalesce(jsonb_object_agg(m.org_id::text, m.role), '{}'::jsonb)
  into org_roles
  from public.memberships m
  where m.user_id = (event ->> 'user_id')::uuid
    and m.deleted_at is null
    and m.status = 'active';

  claims := event -> 'claims';
  claims := jsonb_set(claims, '{org_roles}', org_roles);
  event := jsonb_set(event, '{claims}', claims);

  return event;
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

grant select on public.memberships to supabase_auth_admin;

create policy "auth admin can read memberships" on public.memberships
as permissive for select
to supabase_auth_admin
using (true);
