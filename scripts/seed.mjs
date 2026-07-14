#!/usr/bin/env node
// Seeds a demo organization with members across every role, so there's
// real, visible data to develop and test against. Idempotent — safe to
// re-run. Uses the Auth Admin API to create users (never raw SQL against
// auth.users — see the "Security Weaken" guardrail this repo hit when that
// was attempted for a different reason).
//
// Usage: npm run seed
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the
// environment (see .env.local).

import { createClient } from "@supabase/supabase-js";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.local) before running the seed script.",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_ORG = { name: "Acme Demo Co", slug: "acme-demo" };
const DEMO_PASSWORD = "DemoPassword123!";
const DEMO_USERS = [
  { email: "owner@acme-demo.test", role: "owner" },
  { email: "admin@acme-demo.test", role: "admin" },
  { email: "manager@acme-demo.test", role: "manager" },
  { email: "member1@acme-demo.test", role: "member" },
  { email: "member2@acme-demo.test", role: "member" },
  { email: "guest@acme-demo.test", role: "guest" },
];

async function findOrCreateUser(email) {
  const { data, error: listError } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (listError) throw new Error(`Could not list users: ${listError.message}`);

  const existing = data.users.find((u) => u.email === email);
  if (existing) return existing.id;

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (error || !created.user) throw new Error(`Could not create ${email}: ${error?.message}`);
  return created.user.id;
}

async function findOrCreateOrg() {
  const { data: existing, error: selectError } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", DEMO_ORG.slug)
    .maybeSingle();
  if (selectError) throw new Error(`Could not look up demo org: ${selectError.message}`);
  if (existing) return existing.id;

  const { data, error } = await admin
    .from("organizations")
    .insert(DEMO_ORG)
    .select("id")
    .single();
  if (error) throw new Error(`Could not create demo org: ${error.message}`);
  return data.id;
}

async function ensureMembership(orgId, userId, role) {
  const { data: existing, error: selectError } = await admin
    .from("memberships")
    .select("id, role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (selectError) throw new Error(`Could not look up membership: ${selectError.message}`);

  if (existing) {
    if (existing.role !== role) {
      const { error } = await admin.from("memberships").update({ role }).eq("id", existing.id);
      if (error) throw new Error(`Could not update membership role: ${error.message}`);
    }
    return;
  }

  const { error } = await admin
    .from("memberships")
    .insert({ org_id: orgId, user_id: userId, role, status: "active" });
  if (error) throw new Error(`Could not create membership: ${error.message}`);
}

async function main() {
  const orgId = await findOrCreateOrg();
  console.log(`Demo org: ${DEMO_ORG.name} (${orgId})\n`);

  for (const { email, role } of DEMO_USERS) {
    const userId = await findOrCreateUser(email);
    await ensureMembership(orgId, userId, role);
    console.log(`  ${role.padEnd(8)} ${email}`);
  }

  console.log(`\nDone. Sign in as any of the above (password: ${DEMO_PASSWORD}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
