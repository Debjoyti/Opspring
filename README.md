# Opspring

An AI-powered operating system for businesses — CRM, HRMS, Operations, Finance, and more, in one platform. This repo is starting from its foundation: multi-tenant auth and RBAC. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the tenant model and security design.

## Stack

Next.js (App Router) + Supabase (Postgres, Auth, RLS) + Tailwind + shadcn/ui, on Vercel.

## Getting started

1. Copy the Supabase URL/anon key already in `.env.local` (git-ignored) — they point at the live `opspring` project.
2. Fill in `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` from the [dashboard's API settings](https://supabase.com/dashboard/project/obmqaofldohremylkitt/settings/api). It's server-only, never shipped to the client, and only needed for admin/background scripts.
3. In the Supabase Dashboard, go to **Authentication → Hooks** and enable the **Customize Access Token (JWT) Claims Hook**, pointing at `public.custom_access_token_hook`. This can't be done via migration — see ARCHITECTURE.md.
4. `npm run dev` and open [http://localhost:3000](http://localhost:3000).

```bash
npm run dev    # start the dev server
npm run test   # run the vitest unit suite
npm run build  # production build (runs the route-guard check first)
```

## Database migrations

SQL migrations live in `supabase/migrations/`, applied to the live project via the Supabase MCP. There is no local Supabase CLI/Docker stack wired up yet — see ARCHITECTURE.md for what that means for RLS testing.
