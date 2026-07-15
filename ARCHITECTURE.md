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

## Known limitations / fast-follows

- **No local Supabase CLI/Docker stack.** This environment has no Docker, so RLS was verified directly against the live project using `SET ROLE authenticated; SET request.jwt.claims = '...'` (see `scripts/verify-rls.sql`) rather than an automated integration test against a local stack. Wire up `supabase` CLI + Docker and turn that script into a CI check once available.
- **No `profiles` table.** The dashboard member list shows role/status but not name/email — `auth.users` isn't queryable from the client. Add a `profiles` table (mirrors the Supabase RBAC guide's pattern) when a real UI needs it.
- Microsoft login and MFA are not wired up yet (spec asked for both; Google + email/password is the foundation slice).
- The permission matrix in `src/lib/rbac.ts` is a seed (owner/admin/manager/member/guest × 4 actions) — grow it as real modules land.
