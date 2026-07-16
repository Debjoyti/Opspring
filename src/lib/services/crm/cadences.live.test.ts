/**
 * Live verification of the cadence service against the real Supabase project,
 * running as the demo owner through an RLS-scoped client (the same trust
 * boundary the API routes use). Skipped unless VERIFY_LIVE=1 — this is a
 * verification harness, not part of the normal unit suite.
 *
 * Run: VERIFY_LIVE=1 (plus NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY) npx vitest run cadences.live
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enrollInCadence, unenroll } from "./cadences";
import { runAutomations } from "./automation";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const enabled = process.env.VERIFY_LIVE === "1" && Boolean(url) && Boolean(anonKey);

describe.skipIf(!enabled)("cadences (live)", () => {
  const supabase = createClient(url ?? "http://localhost", anonKey ?? "anon");
  let orgId = "";
  let userId = "";
  let cadenceId = "";
  let leadId = "";
  let ruleId = "";
  let autoLeadId = "";

  beforeAll(async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: "owner@acme-demo.test",
      password: "DemoPassword123!",
    });
    if (error) throw new Error(`sign-in failed: ${error.message}`);
    userId = data.user!.id;

    const { data: memberships } = await supabase
      .from("memberships")
      .select("org_id")
      .eq("user_id", userId)
      .limit(1);
    orgId = memberships![0].org_id as string;

    const { data: lead, error: leadError } = await supabase
      .from("crm_leads")
      .insert({ org_id: orgId, name: "Live Verify Lead", email: "verify@cadence.test" })
      .select("id")
      .single();
    if (leadError) throw new Error(leadError.message);
    leadId = lead.id as string;
  }, 30_000);

  afterAll(async () => {
    // Clean up everything this test created.
    if (cadenceId) {
      await supabase.from("crm_cadences").delete().eq("org_id", orgId).eq("id", cadenceId);
    }
    if (ruleId) {
      await supabase.from("crm_automation_rules").delete().eq("org_id", orgId).eq("id", ruleId);
    }
    for (const id of [leadId, autoLeadId].filter(Boolean)) {
      await supabase.from("crm_activities").delete().eq("org_id", orgId).eq("related_id", id);
      await supabase.from("crm_leads").delete().eq("org_id", orgId).eq("id", id);
    }
    await supabase
      .from("crm_automation_runs")
      .delete()
      .eq("org_id", orgId)
      .in("entity_id", [leadId, autoLeadId].filter(Boolean));
    await supabase.auth.signOut();
  }, 30_000);

  it("enrolls a lead, materializing dated tasks, and blocks double-enrollment", async () => {
    const { data: cadence, error } = await supabase
      .from("crm_cadences")
      .insert({ org_id: orgId, name: "Live verify cadence", owner_id: userId })
      .select("id")
      .single();
    expect(error).toBeNull();
    cadenceId = cadence!.id as string;

    await supabase.from("crm_cadence_steps").insert([
      { org_id: orgId, cadence_id: cadenceId, position: 0, day_offset: 0, activity_type: "call", subject: "LV intro call" },
      { org_id: orgId, cadence_id: cadenceId, position: 1, day_offset: 2, activity_type: "email", subject: "LV intro email" },
      { org_id: orgId, cadence_id: cadenceId, position: 2, day_offset: 5, activity_type: "task", subject: "LV follow up" },
    ]);

    const result = await enrollInCadence(supabase, orgId, userId, cadenceId, {
      entity_type: "lead",
      entity_id: leadId,
    });
    expect(result).toMatchObject({ ok: true, tasksCreated: 3 });

    const { data: tasks } = await supabase
      .from("crm_activities")
      .select("subject, due_at, done, related_id")
      .eq("org_id", orgId)
      .eq("related_id", leadId)
      .order("due_at", { ascending: true });
    expect(tasks!.map((t) => t.subject)).toEqual(["LV intro call", "LV intro email", "LV follow up"]);
    const dayGap =
      (new Date(tasks![1].due_at as string).getTime() -
        new Date(tasks![0].due_at as string).getTime()) /
      86_400_000;
    expect(dayGap).toBeCloseTo(2, 5);

    const dupe = await enrollInCadence(supabase, orgId, userId, cadenceId, {
      entity_type: "lead",
      entity_id: leadId,
    });
    expect(dupe).toMatchObject({ ok: false, error: "already_enrolled" });
  }, 30_000);

  it("auto-enrolls a new lead via the enroll_in_cadence automation action", async () => {
    const { data: rule, error } = await supabase
      .from("crm_automation_rules")
      .insert({
        org_id: orgId,
        name: "Live verify auto-enroll",
        trigger_event: "lead_created",
        actions: [{ type: "enroll_in_cadence", cadence_id: cadenceId }],
        owner_id: userId,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    ruleId = rule!.id as string;

    const { data: lead } = await supabase
      .from("crm_leads")
      .insert({ org_id: orgId, name: "Live Verify Auto Lead" })
      .select("id")
      .single();
    autoLeadId = lead!.id as string;

    await runAutomations(supabase, orgId, userId, "lead_created", {
      entityType: "lead",
      entityId: autoLeadId,
    });

    const { data: tasks } = await supabase
      .from("crm_activities")
      .select("subject")
      .eq("org_id", orgId)
      .eq("related_id", autoLeadId);
    expect(tasks!.map((t) => t.subject)).toContain("LV intro call");

    // Other lead_created rules in the org may fire too — assert only ours.
    const { data: runs } = await supabase
      .from("crm_automation_runs")
      .select("rule_name, results")
      .eq("org_id", orgId)
      .eq("entity_id", autoLeadId)
      .eq("rule_name", "Live verify auto-enroll");
    expect(runs).toHaveLength(1);
    expect((runs![0].results as { type: string; ok: boolean }[])[0]).toMatchObject({
      type: "enroll_in_cadence",
      ok: true,
    });
  }, 30_000);

  it("unenrolls: open generated tasks removed, completed ones kept", async () => {
    // Complete the first task so it must survive the unenroll.
    const { data: firstTask } = await supabase
      .from("crm_activities")
      .select("id")
      .eq("org_id", orgId)
      .eq("related_id", leadId)
      .eq("subject", "LV intro call")
      .single();
    await supabase
      .from("crm_activities")
      .update({ done: true })
      .eq("org_id", orgId)
      .eq("id", firstTask!.id);

    const { data: enrollment } = await supabase
      .from("crm_cadence_enrollments")
      .select("id")
      .eq("org_id", orgId)
      .eq("cadence_id", cadenceId)
      .eq("entity_id", leadId)
      .single();
    const result = await unenroll(supabase, orgId, enrollment!.id as string);
    expect(result.ok).toBe(true);

    const { data: remaining } = await supabase
      .from("crm_activities")
      .select("subject, done")
      .eq("org_id", orgId)
      .eq("related_id", leadId);
    expect(remaining).toHaveLength(1);
    expect(remaining![0]).toMatchObject({ subject: "LV intro call", done: true });
  }, 30_000);
});
