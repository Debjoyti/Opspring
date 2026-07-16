-- Reconciliation migration: the DELETE-safe audit trigger was applied to the
-- live project out-of-band (during duplicate-org cleanup) but its migration
-- files landed on other branches, so this branch's history stopped at the
-- org_id-column fix (0004). Without this, a database provisioned fresh from
-- this branch would FK-violate when deleting an organization (or any row that
-- cascade-deletes), because the AFTER DELETE trigger tries to write an
-- audit_log row referencing an org_id whose parent is already gone.
--
-- For DELETE, org_id is set null; the deleted row's id is still captured in
-- entity_id and the full snapshot in metadata. Idempotent (CREATE OR REPLACE)
-- and already matches the live definition, so this is a no-op there.
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
