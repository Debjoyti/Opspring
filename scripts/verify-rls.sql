-- Manual regression check for cross-tenant RLS isolation (the exact
-- vulnerability class documented in myoffice's SECURITY_HARDENING.md:
-- "always true" policies reachable via the anon/authenticated PostgREST API).
--
-- Run in the Supabase SQL editor, or via `psql`/execute_sql as an admin role.
-- Uses SET ROLE + request.jwt.claims to simulate a specific member's session
-- without needing real auth.users rows. Cleans up after itself.

begin;

insert into public.organizations (id, name, slug) values
  ('00000000-0000-0000-0000-00000000000a', 'Org A (verify-rls)', 'org-a-verify-rls'),
  ('00000000-0000-0000-0000-00000000000b', 'Org B (verify-rls)', 'org-b-verify-rls');

set role authenticated;
set request.jwt.claims = '{"org_roles": {"00000000-0000-0000-0000-00000000000a": "owner"}}';

-- Expect: exactly 1 row (Org A). If Org B leaks here, RLS is broken.
select id, name from public.organizations order by name;

-- Expect: 0 rows. Direct-by-id lookup of a foreign org must not leak either.
select id, name from public.organizations where id = '00000000-0000-0000-0000-00000000000b';

-- Expect: 0 rows updated (RLS blocks the write, not just the read).
update public.organizations set name = 'pwned' where id = '00000000-0000-0000-0000-00000000000b';

reset role;
rollback; -- discard the test orgs and the (blocked) update attempt
