-- 0007 only handled organizations' own DELETE. Deleting an org cascades to
-- its memberships (ON DELETE CASCADE), and by the time that cascade fires,
-- the parent org row is already gone too -- so memberships_audit's insert
-- hit the exact same FK violation one level down. Any DELETE can end up in
-- this position depending on cascade order, so null org_id for all deletes;
-- entity_id and the full row snapshot in metadata still identify the org.
create or replace function private.log_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
begin
  if tg_op = 'DELETE' then
    v_org_id := null;
  elsif tg_table_name = 'organizations' then
    v_org_id := new.id;
  else
    v_org_id := new.org_id;
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
