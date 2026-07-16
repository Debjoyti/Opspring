-- Sales cadences: multi-step outreach templates. Enrolling a lead/contact
-- materializes every step as an activity with a staggered due date up front —
-- no background worker required. Same RLS pattern as everything else.

create table public.crm_cadences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  description text,
  active boolean not null default true,
  owner_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crm_cadences_org_idx on public.crm_cadences (org_id, created_at desc);

create table public.crm_cadence_steps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  cadence_id uuid not null references public.crm_cadences (id) on delete cascade,
  position int not null default 0,
  -- Days after enrollment this step is due.
  day_offset int not null default 0 check (day_offset between 0 and 365),
  activity_type public.crm_activity_type not null default 'task',
  subject text not null,
  created_at timestamptz not null default now()
);
create index crm_cadence_steps_cadence_idx on public.crm_cadence_steps (cadence_id, position);

create table public.crm_cadence_enrollments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  cadence_id uuid not null references public.crm_cadences (id) on delete cascade,
  entity_type text not null check (entity_type in ('lead', 'contact')),
  entity_id uuid not null,
  enrolled_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
-- One active enrollment per record per cadence.
create unique index crm_cadence_enrollments_unique_idx
  on public.crm_cadence_enrollments (cadence_id, entity_type, entity_id);
create index crm_cadence_enrollments_org_idx
  on public.crm_cadence_enrollments (org_id, cadence_id, created_at desc);

-- Generated activities point back at their enrollment so unenrolling can
-- clean up the still-open ones (completed ones are kept as history).
alter table public.crm_activities
  add column enrollment_id uuid references public.crm_cadence_enrollments (id) on delete set null;
create index crm_activities_enrollment_idx on public.crm_activities (enrollment_id);

create trigger crm_cadences_updated before update on public.crm_cadences
  for each row execute function public.set_updated_at();

-- RLS ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['crm_cadences', 'crm_cadence_steps', 'crm_cadence_enrollments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (org_id = any (private.jwt_org_ids())) with check (org_id = any (private.jwt_org_ids()))',
      t || '_org_isolation', t
    );
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
