-- Clinic / practice-management module: patients, appointments, procedure
-- catalog, treatments rendered, and patient-linked billing. Modeled on the
-- Practo export from The Healing Clinic. Same org-scoped real-RLS pattern as
-- the rest of the app (org_id = any private.jwt_org_ids(), never USING(true)).

-- Patients ------------------------------------------------------------------
create table public.clinic_patients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  patient_number text not null,
  name text not null,
  mobile text,
  contact_number text,
  email text,
  secondary_mobile text,
  gender text,
  address text,
  locality text,
  city text,
  pincode text,
  national_id text,
  date_of_birth date,
  age integer,
  anniversary_date date,
  blood_group text,
  remarks text,
  medical_history text,
  referred_by text,
  groups text,
  patient_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index clinic_patients_number_key on public.clinic_patients (org_id, patient_number);
create index clinic_patients_name_idx on public.clinic_patients (org_id, name);
create index clinic_patients_mobile_idx on public.clinic_patients (org_id, mobile);

-- Procedure catalog ---------------------------------------------------------
create table public.clinic_procedures (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  cost numeric(14, 2) not null default 0,
  notes text,
  locale text,
  created_at timestamptz not null default now()
);
create index clinic_procedures_org_idx on public.clinic_procedures (org_id, name);

-- Appointments --------------------------------------------------------------
create table public.clinic_appointments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  patient_id uuid references public.clinic_patients (id) on delete set null,
  patient_number text,
  patient_name text,
  appointment_at timestamptz,
  doctor text,
  status text,
  notes text,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  created_at timestamptz not null default now()
);
create index clinic_appointments_org_idx on public.clinic_appointments (org_id, appointment_at desc);
create index clinic_appointments_patient_idx on public.clinic_appointments (patient_id);

-- Treatments rendered -------------------------------------------------------
create table public.clinic_treatments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  patient_id uuid references public.clinic_patients (id) on delete set null,
  patient_number text,
  treatment_name text not null,
  tooth_number text,
  notes text,
  quantity numeric(12, 2) not null default 1,
  cost numeric(14, 2) not null default 0,
  amount numeric(14, 2) not null default 0,
  discount numeric(14, 2) not null default 0,
  discount_type text,
  doctor text,
  treated_on date,
  created_at timestamptz not null default now()
);
create index clinic_treatments_org_idx on public.clinic_treatments (org_id, treated_on desc);
create index clinic_treatments_patient_idx on public.clinic_treatments (patient_id);
create index clinic_treatments_name_idx on public.clinic_treatments (org_id, treatment_name);

-- Payments ------------------------------------------------------------------
create table public.clinic_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  patient_id uuid references public.clinic_patients (id) on delete set null,
  patient_number text,
  receipt_number text,
  treatment_name text,
  amount_paid numeric(14, 2) not null default 0,
  invoice_number text,
  notes text,
  refund boolean not null default false,
  refunded_amount numeric(14, 2) not null default 0,
  payment_mode text,
  cancelled boolean not null default false,
  paid_on date,
  created_at timestamptz not null default now()
);
create index clinic_payments_org_idx on public.clinic_payments (org_id, paid_on desc);
create index clinic_payments_patient_idx on public.clinic_payments (patient_id);

-- Invoices (line items) -----------------------------------------------------
create table public.clinic_invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  patient_id uuid references public.clinic_patients (id) on delete set null,
  patient_number text,
  doctor text,
  invoice_number text,
  treatment_name text,
  unit_cost numeric(14, 2) not null default 0,
  quantity numeric(12, 2) not null default 1,
  discount numeric(14, 2) not null default 0,
  discount_type text,
  type text,
  tax_name text,
  tax_percent numeric(6, 2) not null default 0,
  cancelled boolean not null default false,
  notes text,
  description text,
  invoiced_on date,
  created_at timestamptz not null default now()
);
create index clinic_invoices_org_idx on public.clinic_invoices (org_id, invoiced_on desc);
create index clinic_invoices_patient_idx on public.clinic_invoices (patient_id);

-- Clinical notes ------------------------------------------------------------
create table public.clinic_clinical_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  patient_id uuid references public.clinic_patients (id) on delete set null,
  patient_number text,
  doctor text,
  type text,
  description text,
  revised boolean not null default false,
  noted_on date,
  created_at timestamptz not null default now()
);
create index clinic_notes_org_idx on public.clinic_clinical_notes (org_id, noted_on desc);
create index clinic_notes_patient_idx on public.clinic_clinical_notes (patient_id);

-- updated_at maintenance for patients (reuses the CRM set_updated_at trigger fn).
create trigger clinic_patients_updated before update on public.clinic_patients
  for each row execute function public.set_updated_at();

-- RLS: scope every table to the caller's orgs, plus grant hygiene.
do $$
declare t text;
begin
  foreach t in array array[
    'clinic_patients', 'clinic_procedures', 'clinic_appointments',
    'clinic_treatments', 'clinic_payments', 'clinic_invoices',
    'clinic_clinical_notes'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (org_id = any (private.jwt_org_ids())) with check (org_id = any (private.jwt_org_ids()))',
      t || '_org_isolation', t
    );
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
