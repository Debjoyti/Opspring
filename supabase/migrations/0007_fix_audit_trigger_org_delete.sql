-- Deleting an organization threw a FK violation: the AFTER DELETE trigger
-- fires once the org row is already gone, so an audit_log insert that still
-- references that org_id fails organizations' FK check. The deleted org's id
-- is still captured in entity_id and the full row snapshot in metadata —
-- only org_id itself needs to be null for this one case.
create or replace function private.log_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
begin
  if tg_op = 'DELETE' and tg_table_name = 'organizations' then
    v_org_id := null;
  elsif tg_table_name = 'organizations' then
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
