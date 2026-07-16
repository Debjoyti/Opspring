-- Supabase linter: extensions don't belong in the public schema. The trigram
-- indexes keep working — operator classes are bound by OID, not search_path.
create schema if not exists extensions;
alter extension pg_trgm set schema extensions;
