-- Workflow automation rules (executed in-process by the API layer on CRM
-- events) with a runs log, and per-user saved list views. Same RLS pattern;
-- saved views are additionally personal (user_id = auth.uid()).

create table public.crm_automation_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  enabled boolean not null default true,
  trigger_event text not null check (trigger_event in (
    'lead_created', 'deal_created', 'deal_stage_changed', 'quote_accepted', 'invoice_paid'
  )),
  -- Only meaningful for deal_stage_changed: fire when a deal lands in this stage.
  condition_stage_id uuid references public.crm_pipeline_stages (id) on delete cascade,
  -- Array of typed actions, validated by Zod at the API boundary:
  -- {type: assign_round_robin} | {type: create_task, subject, due_in_days}
  -- | {type: add_tags, tags: [..]}
  actions jsonb not null default '[]',
  position int not null default 0,
  owner_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crm_automation_rules_org_idx
  on public.crm_automation_rules (org_id, trigger_event, enabled);

create trigger crm_automation_rules_updated before update on public.crm_automation_rules
  for each row execute function public.set_updated_at();

-- Observability: one row per rule execution against an entity.
create table public.crm_automation_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  rule_id uuid references public.crm_automation_rules (id) on delete set null,
  rule_name text not null,
  trigger_event text not null,
  entity_type text not null,
  entity_id uuid not null,
  results jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index crm_automation_runs_org_idx on public.crm_automation_runs (org_id, created_at desc);

-- Saved list views (personal) ---------------------------------------------------
create table public.crm_saved_views (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  resource text not null check (resource in ('leads', 'deals', 'contacts', 'accounts')),
  name text not null,
  filters jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index crm_saved_views_user_idx on public.crm_saved_views (org_id, user_id, resource);

-- RLS ------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['crm_automation_rules', 'crm_automation_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (org_id = any (private.jwt_org_ids())) with check (org_id = any (private.jwt_org_ids()))',
      t || '_org_isolation', t
    );
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Saved views are org-scoped AND personal.
alter table public.crm_saved_views enable row level security;
create policy crm_saved_views_personal on public.crm_saved_views
for all to authenticated
using (org_id = any (private.jwt_org_ids()) and user_id = auth.uid())
with check (org_id = any (private.jwt_org_ids()) and user_id = auth.uid());
revoke all on public.crm_saved_views from anon, authenticated;
grant select, insert, update, delete on public.crm_saved_views to authenticated;
