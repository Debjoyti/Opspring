-- The generic trigger assumed every audited table has an org_id column.
-- organizations itself has no org_id — its own id IS the org id. Caught by
-- scripts/verify-rls.sql, which failed with "record new has no field org_id".
create or replace function private.log_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
begin
  if tg_table_name = 'organizations' then
    v_org_id := coalesce(new.id, old.id);
  else
    v_org_id := coalesce(new.org_id, old.org_id);
  end if;

  insert into public.audit_log (org_id, actor_id, action, entity, entity_id, metadata)
  values (
    v_org_id,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(new.id, old.id),
    case tg_op when 'DELETE' then to_jsonb(old) else to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;
