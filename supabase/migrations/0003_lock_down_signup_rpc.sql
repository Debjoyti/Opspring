-- Supabase grants EXECUTE on new public-schema functions to anon/authenticated/
-- service_role by default privilege, independent of `revoke ... from public`.
-- create_organization_with_owner must only be callable by a signed-in user.
revoke execute on function public.create_organization_with_owner(text, text) from anon;
