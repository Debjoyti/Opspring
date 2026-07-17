# Architecture: Foundation (Auth, Multi-Tenancy, RBAC)

## Why this document exists

Opspring's sibling project, `myoffice`, drifted into two competing tenant models (`employees.company_id` vs. a later `user_company_roles` table) because the shape wasn't fixed up front, and shipped RLS policies that were `USING (true)` — "always true" — across 87 tables, silently reachable via the anon PostgREST API. This document is the single source of truth for the tenant/RLS decision so Opspring doesn't repeat that drift.

## Tenant model

- `organizations` is the tenant root.
- `memberships` (`user_id`, `org_id`, `role`, `status`) is the **only** identity/tenancy join. A user can belong to many orgs. There is no folding of org/role into a domain table — every future module table just gets an `org_id` FK.
- `role` is one of `owner | admin | manager | member | guest` (Postgres enum `org_role`). This is a seed matrix (`src/lib/rbac.ts`), not the full spec's role list — extend it as real actions exist to model permissions against.

## Tenant isolation: real RLS, not app-code filtering

Every tenant table has an RLS policy that checks the caller's JWT claims — never `USING (true)`, never "trust the `company_id` the app code happened to filter by."

1. A **custom access token hook** (`public.custom_access_token_hook`, migration `0002`) runs on every token mint/refresh. It reads the user's active memberships and injects an `org_roles` claim into the JWT: `{"<org_id>": "<role>", ...}` — every org the user belongs to, not just one, so switching the active org in the UI doesn't require a token refresh.
2. **Must be enabled manually** in the Supabase Dashboard (Authentication → Hooks → Customize Access Token Claims Hook) — this isn't expressible in a SQL migration. Until it's enabled, `org_roles` is empty and every RLS policy denies access (fails closed, not open).
3. `private.jwt_org_ids()` and `private.jwt_role_for_org(org_id)` (migration `0001`) parse that claim. RLS policies use them, e.g.:
   ```sql
   using (org_id = any (private.jwt_org_ids()))
   ```
4. Defense in depth: `revoke all on all tables in schema public from anon, authenticated`, then explicit narrow `grant`s — even though RLS is real this time, myoffice's incident showed relying on RLS alone, with no grant hygiene, is one migration-mistake away from a full bypass.
5. Signup is atomic: `create_organization_with_owner` (`SECURITY DEFINER`) inserts the org and the first `owner` membership in one function call — never a two-step app-code insert that could race or half-complete. `EXECUTE` on it is revoked from `anon` explicitly (Supabase grants new public-schema functions to `anon` by default — `revoke ... from public` alone does **not** undo that; see migration `0003`).

## Auth clients — pick the right one

- `src/lib/supabase/server.ts` — per-request SSR client, scoped to the caller's session cookie. **Every normal read/write goes through this**, so RLS is actually exercised. This is the opposite of myoffice's pattern, where routes used the service-role client and enforced tenancy only in app code.
- `src/lib/supabase/admin.ts` — service-role, bypasses RLS entirely. Server-only, reserved for Inngest jobs and admin scripts — never imported by code that serves a user request.
- Authentication is verified with `supabase.auth.getUser()` (round-trips to the Auth server), never `getSession()` alone for authentication — myoffice had a period where `getSession()` trusted an unverified cookie. `getSession()` is only read *after* `getUser()` has already validated the session, purely to extract the (now-trusted) `org_roles` claim from the JWT payload (`src/lib/supabase/claims.ts`).

## API guard

`src/lib/api/handler.ts` (`withOrgAuth`) wraps every `/app/api/**` route: verifies the user, requires an `x-org-id` header, checks membership + role from the JWT claim, 401/400/403s otherwise. `scripts/check-route-guards.mjs` runs as `prebuild` and fails the build if a route has no recognized guard call and isn't explicitly allow-listed as public — mirrors myoffice's `check-route-guards.mjs`, wired in from day one instead of retrofitted.

## AI assistant

`/dashboard/assistant` is a real, working AI feature — not a stub — grounded entirely in data that already exists (`organizations`, `memberships`, `audit_log`). It is deliberately **not** the full "AI FEATURES" list from the original spec (lead scoring, resume screening, payroll anomaly detection, forecasting, meeting summaries, document summarization, email generation, voice assistant, etc.) — those all require their underlying module's data (CRM, HRMS, recruitment, payroll, documents, projects) to exist first. Building them now would mean either faking that data or shipping an AI feature with nothing real to act on. The right sequencing is: build the module, then its AI feature, together — not AI features first.

- **Model**: resolved through the Vercel AI Gateway via a plain model-id string (`src/lib/integrations/ai-gateway/model.ts`) — no provider SDK package. Requires `AI_GATEWAY_API_KEY` in the environment (get one from the Vercel dashboard); without it the assistant UI loads but sending a message fails, same class of gap as the Supabase service-role key.
- **Real tools, not mocked**: `src/lib/services/ai/tools.ts` — `listMembers`, `getOrganizationOverview`, `summarizeRecentActivity` all query the live tables through `ctx.supabase` (the caller's RLS-scoped client from `withOrgAuth`). The assistant physically cannot return another org's data, even under a malicious prompt — that's enforced by RLS underneath the tool call, not by the tool's own logic.
- **Persistence**: one conversation per `(user, org)` (`ai_conversations`/`ai_messages`, migration `0005`), same RLS pattern as everything else. Messages are insert-only (immutable log); `saveNewMessages` upserts with `ignoreDuplicates` since the client resends full history each turn.
- **Route**: `/api/v1/assistant` is wrapped in the same `withOrgAuth` guard as any other API route — this was the first real (non-test) consumer of that guard, and it caught a bug: `proxy.ts` was redirecting unauthenticated `/api/*` requests to the HTML `/login` page instead of letting the route return JSON 401/403. Fixed by excluding `/api/*` from the proxy's redirect decision — API routes own their own auth response shape, proxy only handles page-level redirects.

## CRM module

The first real business module. Same architecture the rest of the app follows, so future modules (HRMS, Finance, Inventory) can copy the pattern:

- **Schema** (`0007_crm_schema.sql`): `crm_accounts`, `crm_contacts`, `crm_leads`, `crm_deals`, `crm_activities` — every table `org_id`-scoped with a real RLS policy (`org_id = any (private.jwt_org_ids())`), never `USING (true)`, plus `revoke`/`grant` hygiene. Enum types for lead status, deal stage, activity type.
- **Service layer** (`src/lib/services/crm/`): `repository.ts` (thin CRUD that always stamps `org_id` and runs through the caller's RLS client), `metrics.ts` (one-pass overview aggregation), `types.ts` (Zod schemas + shared enums).
- **API** (`src/app/api/v1/crm/*`): every entity has a collection route (`GET`/`POST`) and item route (`GET`/`PATCH`/`DELETE`), plus `overview`. They're generated by `crudCollection`/`crudItem` (`src/lib/api/crud-route.ts`), which wrap each handler in `withOrgAuth` and validate with the entity's Zod schema. `check-route-guards.mjs` recognizes those factories as guards.
- **UI** (`src/app/dashboard/crm/*`): a real sidebar-nav dashboard (`src/components/dashboard/sidebar.tsx`) with an Overview (KPI cards, pipeline-by-stage bars, leads-by-status), a Deals **kanban pipeline** with stage-move controls, and Leads/Accounts/Contacts/Activities list+create+edit+delete screens. The CRUD screens share one `EntityManager` component driven by a field/column config; only Deals is bespoke. Data flows through TanStack Query against the API, with the active org carried in every request via the `x-org-id` header.
- **Active org** is carried in the URL (`?org=`) and resolved once per request by `resolveActiveOrg` (`src/lib/dashboard/org-context.ts`), which also guards the whole dashboard.

## CRM expansion (migration `0008`, branch `feature/world-class-crm`)

Second slice of the CRM, following the exact same patterns (org-scoped RLS, Zod-validated `withOrgAuth` routes, JS-side aggregation, TanStack Query UI):

- **Custom pipelines**: `crm_pipelines` + `crm_pipeline_stages` (per-stage win `probability`, `kind` of `open|won|lost`). Deals migrated from the fixed `crm_deal_stage` enum (dropped) to `stage_id`/`pipeline_id`; the backfill created a default "Sales Pipeline" per org and an `organizations` insert-trigger (`create_default_pipeline`, SECURITY DEFINER for the same reason as signup) does it for new orgs. Stage moves re-derive `pipeline_id` and close state (`closed_at`, `lost_reason`) server-side from the target stage's `kind` (`src/lib/services/crm/deals.ts`).
- **Lead conversion**: `crm_convert_lead()` — SECURITY **INVOKER** on purpose, so every statement runs under the caller's RLS; the function exists only to make account-reuse + contact + optional deal + status flip atomic. Reached via `POST /api/v1/crm/leads/[id]/convert`.
- **Lead scoring**: `src/lib/services/crm/scoring.ts`. Deterministic rules engine always available; when `AI_GATEWAY_API_KEY` is set the score comes from `generateObject` against `ASSISTANT_MODEL` with the rules as fallback. `score_source` records which path produced the number.
- **Round-robin assignment** (`POST /leads/assign`): least-loaded active member first, counts include in-batch assignments (`src/lib/services/crm/assignment.ts` — pure, tested).
- **CSV import/export**: hand-rolled RFC-4180 parser/serializer in `src/lib/csv.ts` (pure, tested); import validates per-row with the same Zod schema as the API and skips duplicate emails.
- **Duplicates + merge**: email/phone/name grouping (`dedupe.ts`, pure, tested); merge fills the primary's empty fields, re-points notes/activities/FKs first and deletes duplicates last, so a mid-way failure never leaves dangling references.
- **Notes & timeline**: polymorphic `crm_notes`; `GET /timeline` merges notes + activities per record.
- **Reports** (`/dashboard/crm/reports`): funnel, win/loss by month + loss reasons, velocity (cycle days, open age), per-pipeline weighted forecast.
- **Tasks** (`/dashboard/crm/tasks`): activities of type `task` bucketed overdue/today/upcoming/done.
- Tags are `text[]` columns with GIN indexes on all four entities — deliberately not a join table at this scale.

### Slice 2 (migrations `0009`–`0010`): products, quotes, templates, search

- **Products** (`crm_products`): catalog with SKU (unique per org when set), price, billing interval, active flag. Standard crud-factory routes.
- **Deal line items** (`crm_deal_items`): a DB trigger (`crm_recalc_deal_amount`) keeps `crm_deals.amount` equal to the item sum whenever a deal has items; deleting the last item returns the deal to manual-amount mode. Managed from the deals board ("Items" on each card).
- **Quotes** (`crm_quotes` + `crm_quote_items`): per-org sequential numbering via a before-insert trigger under a unique index (clash errors rather than duplicating). Status machine `draft→sent→accepted|declined|expired` (expired→sent for re-sends) enforced server-side in `/quotes/[id]/status`, stamping `sent_at`/`accepted_at`/`declined_at`. Quote math lives in `src/lib/services/crm/quotes.ts` (pure, tested) and is shared by API, builder UI, and the print view. Creating a quote from a deal inherits account/contact/currency and copies the deal's line items. Printable view at `/print/quotes/[id]` (server-rendered under RLS; browser print → PDF).
- **Email templates** (`crm_email_templates`): `{{merge_field}}` rendering in `templates.ts` (pure, tested), preview against any lead/contact, copy or `mailto:` handoff. Actual SMTP/Gmail *sending* is deliberately not faked — it needs a real mail integration (OAuth credentials) first.
- **Global search**: `GET /api/v1/crm/search?q=` ILIKE across leads/contacts/accounts/deals/products/quotes, backed by `pg_trgm` GIN indexes (extension moved to the `extensions` schema in `0010` per the Supabase linter). Ctrl/Cmd-K dialog in the dashboard header.

### Slice 3 (migration `0011`): invoices, payments, public quote acceptance

- **Invoices** (`crm_invoices` + `crm_invoice_items` + `crm_payments`): per-org INV-numbering (same trigger pattern as quotes), created from scratch or from a quote (inherits parties/pricing/items). The API only performs `draft→sent` and `→void`; the **payments ledger drives** `sent→partially_paid→paid` via the `crm_recalc_invoice_paid` trigger, with `crm_invoice_total()` mirroring the JS `quoteTotals()` rounding exactly so SQL and JS never disagree on "fully paid". The payments route rejects amounts above the remaining balance. Items are only mutable on drafts; only drafts/voids are deletable. Printable view at `/print/invoices/[id]` with paid/due summary.
- **Public quote acceptance** (`/q/<token>`): every quote carries a `public_token` (random 128-bit uuid, unique-indexed). The page is anonymous by design (allow-listed in `proxy.ts`); data access goes through two **SECURITY DEFINER** functions — `crm_quote_public(token)` (returns exactly one non-draft quote, limited fields, no org enumeration) and `crm_quote_respond(token, accept)` (answers a `sent` quote exactly once, stamps timestamps, auto-logs a timeline activity). Both are intentionally `EXECUTE`-granted to `anon` — the Supabase linter flags them (0028) and that is expected, same class as the signup RPC. "Copy link" on the quotes screen produces the customer URL; accepted quotes get a "To invoice" action.

### Slice 4 (migration `0012`): automations, saved views

- **Automation rules** (`crm_automation_rules` + `crm_automation_runs`): event → actions, executed **in-process by the API layer** (no background worker exists yet — rules run inline, awaited, and `runAutomations` never throws so a failing rule can't fail the request that triggered it). Events: `lead_created`, `deal_created`, `deal_stage_changed` (optional target-stage condition), `quote_accepted`, `invoice_paid`. Actions (Zod discriminated union): `assign_round_robin` (leads), `create_task` (any event; quote/invoice tasks attach to the linked deal or account), `add_tags` (leads/deals). Every rule execution writes a `crm_automation_runs` row with per-action results, surfaced on the Automations screen. Wire-in points: the crud factory's new `afterCreate` hook (leads), the custom deal create/stage-move routes (stage moves fire only on an actual change), quote status → accepted, and the payments route when a payment settles an invoice. Known gaps, on purpose: CSV import does not fire per-row `lead_created` events, and a *customer* accept via `/q/<token>` doesn't run rules (the anon client can't read them under RLS) — dashboard-side accepts do.
- **Saved views** (`crm_saved_views`): per-user (RLS: org member **and** `user_id = auth.uid()`), storing a filters blob. The leads screen gained a filter bar (text/status/tag, applied client-side at this scale) with save/apply/delete.

### Slice 5 (migration `0013`): sales cadences

- **Cadences** (`crm_cadences` + `crm_cadence_steps` + `crm_cadence_enrollments`): multi-step outreach templates (each step = day offset + activity type + subject). Enrolling a lead/contact **materializes every step as a dated activity up front** (`planEnrollmentTasks`, pure + tested) — that design choice is what makes sequences work with zero background infrastructure. Generated activities carry an `enrollment_id`; unenrolling deletes only the still-open ones (completed steps stay as history). One enrollment per record per cadence (unique index → 409 on double-enroll). Enrollment rolls back if task materialization fails.
- New automation action `enroll_in_cadence` (lead_created only), so "lead created → auto-enroll in the intro cadence" is a two-click rule.
- UI: Cadences screen (builder, pause/activate, enrollments dialog with unenroll), an "Enroll" action on lead rows, and the cadence picker inside the automation rule builder.

## Clinic / practice-management module

A second real vertical (alongside the sales CRM), modeled on the Practo export from The Healing Clinic — a wellness/pain clinic. Proves the platform isn't CRM-only: the same foundation (orgs, memberships, real RLS) carries a completely different domain.

- **Schema** (`0015_clinic_module.sql`): `clinic_patients`, `clinic_procedures`, `clinic_appointments`, `clinic_treatments`, `clinic_payments`, `clinic_invoices`, `clinic_clinical_notes`. Every table `org_id`-scoped with the same real-RLS policy pattern, plus grant hygiene. Child tables keep both a `patient_id` FK and the source `patient_number` (so an import can link even before the FK is resolved).
- **Importer** (`scripts/import-practo.mjs`, `npm run import:practo`): maps the 10 Practo CSVs into the clinic tables for a target org, patients first (to build `patient_number → id`), then batched inserts. Reads CSVs from a local `PRACTO_DIR` — **patient PII is never committed to the repo**. Handles Practo's single-quote-wrapped values and INR amounts.
- **API** (`/api/v1/clinic/*`): read-oriented list endpoints via a `clinicList` factory (supports `?q=` ILIKE search across configured columns, `?limit/offset`, capped) plus a patient-detail route (patient + their appointments/treatments/payments/notes) and an overview aggregate. All guarded by `withOrgAuth`; `check-route-guards.mjs` recognizes `clinicList` as a guard.
- **Metrics** (`src/lib/services/clinic/metrics.ts`): overview uses `head:true` counts so it never pulls the 13k appointment / 6k payment rows into memory; money/mode/procedure rollups pull only the needed columns.
- **UI** (`src/app/dashboard/clinic/*`): a clinic overview (collected revenue, patients, appointments today/upcoming, top procedures, payment modes, recent payments), a searchable Patients list with a full patient-history drawer, and Appointments / Procedures / Billing screens. The sidebar is now grouped into sections (Clinic / CRM / Workspace).
- **Scope note**: this is a practice-management module (patients, visits, billing), deliberately distinct from the sales CRM (leads → deals). They share the dashboard shell and foundation but not tables.

## Known limitations / fast-follows

- **No local Supabase CLI/Docker stack.** This environment has no Docker, so RLS was verified directly against the live project using `SET ROLE authenticated; SET request.jwt.claims = '...'` (see `scripts/verify-rls.sql`) rather than an automated integration test against a local stack. Wire up `supabase` CLI + Docker and turn that script into a CI check once available.
- **No `profiles` table.** The dashboard member list shows role/status but not name/email — `auth.users` isn't queryable from the client. Add a `profiles` table (mirrors the Supabase RBAC guide's pattern) when a real UI needs it.
- Microsoft login and MFA are not wired up yet (spec asked for both; Google + email/password is the foundation slice).
- The permission matrix in `src/lib/rbac.ts` is a seed (owner/admin/manager/member/guest × 4 actions) — grow it as real modules land.
