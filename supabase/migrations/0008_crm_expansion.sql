-- CRM expansion: custom pipelines & stages, lead scoring + conversion,
-- polymorphic notes, tags. Same RLS pattern as everything else
-- (private.jwt_org_ids(), never USING (true)), explicit grants, and explicit
-- revokes on new public functions (Supabase grants them to anon by default).

-- Pipelines ------------------------------------------------------------------
create table public.crm_pipelines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crm_pipelines_org_idx on public.crm_pipelines (org_id, position);
-- at most one default pipeline per org
create unique index crm_pipelines_default_idx on public.crm_pipelines (org_id)
  where is_default;

create table public.crm_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  pipeline_id uuid not null references public.crm_pipelines (id) on delete cascade,
  name text not null,
  position int not null default 0,
  probability int not null default 50 check (probability between 0 and 100),
  kind text not null default 'open' check (kind in ('open', 'won', 'lost')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crm_pipeline_stages_pipeline_idx
  on public.crm_pipeline_stages (pipeline_id, position);

create trigger crm_pipelines_updated before update on public.crm_pipelines
  for each row execute function public.set_updated_at();
create trigger crm_pipeline_stages_updated before update on public.crm_pipeline_stages
  for each row execute function public.set_updated_at();

-- Seed a default pipeline for every existing org ------------------------------
insert into public.crm_pipelines (org_id, name, is_default)
select id, 'Sales Pipeline', true from public.organizations;

insert into public.crm_pipeline_stages (org_id, pipeline_id, name, position, probability, kind)
select p.org_id, p.id, s.name, s.position, s.probability, s.kind
from public.crm_pipelines p
cross join (
  values
    ('Qualified', 0, 20, 'open'),
    ('Proposal', 1, 45, 'open'),
    ('Negotiation', 2, 70, 'open'),
    ('Won', 3, 100, 'won'),
    ('Lost', 4, 0, 'lost')
) as s (name, position, probability, kind)
where p.is_default;

-- New orgs get the same default pipeline automatically. SECURITY DEFINER so
-- the insert (which happens during signup, before the caller's JWT carries
-- the new org) bypasses RLS the same way create_organization_with_owner does.
create or replace function public.create_default_pipeline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid;
begin
  insert into public.crm_pipelines (org_id, name, is_default)
  values (new.id, 'Sales Pipeline', true)
  returning id into pid;

  insert into public.crm_pipeline_stages (org_id, pipeline_id, name, position, probability, kind)
  values
    (new.id, pid, 'Qualified', 0, 20, 'open'),
    (new.id, pid, 'Proposal', 1, 45, 'open'),
    (new.id, pid, 'Negotiation', 2, 70, 'open'),
    (new.id, pid, 'Won', 3, 100, 'won'),
    (new.id, pid, 'Lost', 4, 0, 'lost');
  return new;
end;
$$;
revoke execute on function public.create_default_pipeline() from public, anon, authenticated;

create trigger organizations_default_pipeline
  after insert on public.organizations
  for each row execute function public.create_default_pipeline();

-- Deals move from the fixed stage enum to pipeline stages ---------------------
alter table public.crm_deals
  add column pipeline_id uuid references public.crm_pipelines (id) on delete restrict,
  add column stage_id uuid references public.crm_pipeline_stages (id) on delete restrict,
  add column lost_reason text,
  add column closed_at timestamptz;

update public.crm_deals d
set pipeline_id = p.id,
    stage_id = s.id,
    closed_at = case when d.stage in ('won', 'lost') then d.updated_at end
from public.crm_pipelines p
join public.crm_pipeline_stages s on s.pipeline_id = p.id
where p.org_id = d.org_id
  and p.is_default
  and s.name = case d.stage
    when 'qualified' then 'Qualified'
    when 'proposal' then 'Proposal'
    when 'negotiation' then 'Negotiation'
    when 'won' then 'Won'
    when 'lost' then 'Lost'
  end;

alter table public.crm_deals
  alter column pipeline_id set not null,
  alter column stage_id set not null;
alter table public.crm_deals drop column stage;
drop type public.crm_deal_stage;
create index crm_deals_stage_id_idx on public.crm_deals (org_id, stage_id);

-- Leads: scoring + conversion tracking ----------------------------------------
alter table public.crm_leads
  add column title text,
  add column score int check (score between 0 and 100),
  add column score_source text check (score_source in ('ai', 'rules')),
  add column score_reason text,
  add column scored_at timestamptz,
  add column converted_account_id uuid references public.crm_accounts (id) on delete set null,
  add column converted_contact_id uuid references public.crm_contacts (id) on delete set null,
  add column converted_deal_id uuid references public.crm_deals (id) on delete set null,
  add column converted_at timestamptz;

-- Tags on every core entity ---------------------------------------------------
alter table public.crm_accounts add column tags text[] not null default '{}';
alter table public.crm_contacts add column tags text[] not null default '{}';
alter table public.crm_leads add column tags text[] not null default '{}';
alter table public.crm_deals add column tags text[] not null default '{}';
create index crm_accounts_tags_idx on public.crm_accounts using gin (tags);
create index crm_contacts_tags_idx on public.crm_contacts using gin (tags);
create index crm_leads_tags_idx on public.crm_leads using gin (tags);
create index crm_deals_tags_idx on public.crm_deals using gin (tags);

-- Notes (polymorphic, per record) ----------------------------------------------
create table public.crm_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  entity_type text not null check (entity_type in ('lead', 'account', 'contact', 'deal')),
  entity_id uuid not null,
  body text not null,
  author_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crm_notes_entity_idx
  on public.crm_notes (org_id, entity_type, entity_id, created_at desc);

create trigger crm_notes_updated before update on public.crm_notes
  for each row execute function public.set_updated_at();

-- Tasks view support: open tasks sorted by due date
create index crm_activities_task_idx on public.crm_activities (org_id, done, due_at);

-- Lead conversion: one atomic call. SECURITY INVOKER (default) on purpose —
-- every statement runs under the caller's RLS, so a lead outside the caller's
-- orgs simply isn't found. Being a single function call makes it atomic.
create or replace function public.crm_convert_lead(
  p_lead_id uuid,
  p_create_deal boolean default true,
  p_deal_name text default null,
  p_deal_amount numeric default 0
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_lead public.crm_leads;
  v_account_id uuid;
  v_contact_id uuid;
  v_deal_id uuid;
  v_first text;
  v_last text;
  v_pipeline_id uuid;
  v_stage_id uuid;
begin
  select * into v_lead from public.crm_leads where id = p_lead_id for update;
  if not found then
    raise exception 'lead_not_found';
  end if;
  if v_lead.status = 'converted' then
    raise exception 'lead_already_converted';
  end if;

  -- Reuse an account with the same (case-insensitive) name before creating one.
  if v_lead.company is not null and length(trim(v_lead.company)) > 0 then
    select id into v_account_id
    from public.crm_accounts
    where org_id = v_lead.org_id and lower(name) = lower(trim(v_lead.company))
    limit 1;
    if v_account_id is null then
      insert into public.crm_accounts (org_id, name, phone, owner_id)
      values (v_lead.org_id, trim(v_lead.company), v_lead.phone, v_lead.owner_id)
      returning id into v_account_id;
    end if;
  end if;

  v_first := split_part(trim(v_lead.name), ' ', 1);
  v_last := nullif(trim(substr(trim(v_lead.name), length(v_first) + 1)), '');

  insert into public.crm_contacts (org_id, account_id, first_name, last_name, email, phone, title, owner_id)
  values (v_lead.org_id, v_account_id, v_first, v_last, v_lead.email, v_lead.phone, v_lead.title, v_lead.owner_id)
  returning id into v_contact_id;

  if p_create_deal then
    select p.id into v_pipeline_id
    from public.crm_pipelines p
    where p.org_id = v_lead.org_id
    order by p.is_default desc, p.created_at
    limit 1;
    if v_pipeline_id is null then
      raise exception 'no_pipeline';
    end if;

    select s.id into v_stage_id
    from public.crm_pipeline_stages s
    where s.pipeline_id = v_pipeline_id and s.kind = 'open'
    order by s.position
    limit 1;
    if v_stage_id is null then
      raise exception 'no_open_stage';
    end if;

    insert into public.crm_deals
      (org_id, name, account_id, contact_id, amount, pipeline_id, stage_id, owner_id)
    values
      (v_lead.org_id,
       coalesce(nullif(trim(p_deal_name), ''), trim(v_lead.name) || ' deal'),
       v_account_id, v_contact_id, coalesce(p_deal_amount, 0),
       v_pipeline_id, v_stage_id, v_lead.owner_id)
    returning id into v_deal_id;
  end if;

  update public.crm_leads
  set status = 'converted',
      converted_account_id = v_account_id,
      converted_contact_id = v_contact_id,
      converted_deal_id = v_deal_id,
      converted_at = now()
  where id = p_lead_id;

  insert into public.crm_activities (org_id, type, subject, related_type, related_id, actor_id, done)
  values (v_lead.org_id, 'note', 'Lead converted', 'lead', p_lead_id, auth.uid(), true);

  return jsonb_build_object(
    'account_id', v_account_id,
    'contact_id', v_contact_id,
    'deal_id', v_deal_id
  );
end;
$$;
revoke execute on function public.crm_convert_lead(uuid, boolean, text, numeric) from public, anon;
grant execute on function public.crm_convert_lead(uuid, boolean, text, numeric) to authenticated;

-- RLS + grants for the new tables ----------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['crm_pipelines', 'crm_pipeline_stages', 'crm_notes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (org_id = any (private.jwt_org_ids())) with check (org_id = any (private.jwt_org_ids()))',
      t || '_org_isolation', t
    );
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
