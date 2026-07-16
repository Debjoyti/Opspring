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

async function seedCrm(orgId, ownerId) {
  // Idempotent: skip if this org already has CRM data.
  const { count } = await admin
    .from("crm_accounts")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);
  if ((count ?? 0) > 0) {
    console.log("\nCRM demo data already present — skipping.");
    return;
  }

  const account = async (name, industry, website) => {
    const { data, error } = await admin
      .from("crm_accounts")
      .insert({ org_id: orgId, name, industry, website, owner_id: ownerId })
      .select("id")
      .single();
    if (error) throw new Error(`account ${name}: ${error.message}`);
    return data.id;
  };

  const globex = await account("Globex Corporation", "Manufacturing", "https://globex.example");
  const initech = await account("Initech", "Software", "https://initech.example");
  const umbrella = await account("Umbrella Health", "Healthcare", "https://umbrella.example");

  await admin.from("crm_contacts").insert([
    { org_id: orgId, account_id: globex, first_name: "Hank", last_name: "Scorpio", email: "hank@globex.example", title: "CEO", owner_id: ownerId },
    { org_id: orgId, account_id: initech, first_name: "Bill", last_name: "Lumbergh", email: "bill@initech.example", title: "VP Operations", owner_id: ownerId },
    { org_id: orgId, account_id: umbrella, first_name: "Alice", last_name: "Chen", email: "alice@umbrella.example", title: "Procurement Lead", owner_id: ownerId },
  ]);

  await admin.from("crm_leads").insert([
    { org_id: orgId, name: "Priya Nair", company: "Wayne Enterprises", email: "priya@wayne.example", source: "Website", status: "new", owner_id: ownerId },
    { org_id: orgId, name: "Marcus Reid", company: "Stark Industries", email: "marcus@stark.example", source: "Referral", status: "contacted", owner_id: ownerId },
    { org_id: orgId, name: "Lena Ortiz", company: "Cyberdyne", email: "lena@cyberdyne.example", source: "Event", status: "qualified", owner_id: ownerId },
    { org_id: orgId, name: "Tom Fisher", company: "Soylent Co", email: "tom@soylent.example", source: "Cold call", status: "unqualified", owner_id: ownerId },
  ]);

  // Deals live in the org's default pipeline (created by migration 0008's
  // organizations trigger / backfill); stages are looked up by name.
  const { data: pipeline, error: pipelineError } = await admin
    .from("crm_pipelines")
    .select("id, stages:crm_pipeline_stages(id, name, kind)")
    .eq("org_id", orgId)
    .eq("is_default", true)
    .single();
  if (pipelineError) throw new Error(`default pipeline: ${pipelineError.message}`);
  const stageByName = Object.fromEntries(pipeline.stages.map((s) => [s.name, s]));
  const deal = (name, account_id, amount, stageName) => {
    const stage = stageByName[stageName];
    if (!stage) throw new Error(`stage ${stageName} not found in default pipeline`);
    return {
      org_id: orgId, name, account_id, amount, owner_id: ownerId,
      pipeline_id: pipeline.id, stage_id: stage.id,
      closed_at: stage.kind === "open" ? null : new Date().toISOString(),
      lost_reason: stage.kind === "lost" ? "Chose competitor" : null,
    };
  };
  await admin.from("crm_deals").insert([
    deal("Globex - Annual platform license", globex, 48000, "Proposal"),
    deal("Initech - Pilot rollout", initech, 15000, "Qualified"),
    deal("Umbrella - Data migration", umbrella, 32000, "Negotiation"),
    deal("Globex - Support add-on", globex, 12000, "Won"),
    deal("Initech - Legacy renewal", initech, 8000, "Lost"),
  ]);

  await admin.from("crm_activities").insert([
    { org_id: orgId, type: "call", subject: "Discovery call with Globex", notes: "Discussed licensing tiers and timeline.", related_type: "account", related_id: globex, actor_id: ownerId, done: true },
    { org_id: orgId, type: "email", subject: "Sent proposal to Initech", notes: "Proposal PDF for pilot rollout.", related_type: "account", related_id: initech, actor_id: ownerId, done: true },
    { org_id: orgId, type: "meeting", subject: "Umbrella migration scoping", notes: "Reviewed data volumes and cutover plan.", related_type: "account", related_id: umbrella, actor_id: ownerId, done: false },
  ]);

  console.log("\nSeeded CRM demo data: 3 accounts, 3 contacts, 4 leads, 5 deals, 3 activities.");
}

async function main() {
  const orgId = await findOrCreateOrg();
  console.log(`Demo org: ${DEMO_ORG.name} (${orgId})\n`);

  let ownerId = null;
  for (const { email, role } of DEMO_USERS) {
    const userId = await findOrCreateUser(email);
    await ensureMembership(orgId, userId, role);
    if (role === "owner") ownerId = userId;
    console.log(`  ${role.padEnd(8)} ${email}`);
  }

  if (ownerId) await seedCrm(orgId, ownerId);

  console.log(`\nDone. Sign in as any of the above (password: ${DEMO_PASSWORD}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
