import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { planRoundRobin } from "@/lib/services/crm/assignment";
import { assignLeadsInput } from "@/lib/services/crm/types";

/**
 * Round-robin assignment. Distributes the given leads (default: every
 * unowned, unconverted lead) across the org's active members, least-loaded
 * first, so a batch spreads evenly.
 */
export const POST = withOrgAuth(async (req, ctx) => {
  const body = await req.json().catch(() => ({}));
  const parsed = assignLeadsInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { data: members, error: membersError } = await ctx.supabase
    .from("memberships")
    .select("user_id")
    .eq("org_id", ctx.orgId)
    .eq("status", "active")
    .in("role", ["owner", "admin", "manager", "member"]);
  if (membersError) return NextResponse.json({ error: membersError.message }, { status: 500 });
  if (!members || members.length === 0) {
    return NextResponse.json({ error: "no_assignable_members" }, { status: 422 });
  }

  let leadsQuery = ctx.supabase
    .from("crm_leads")
    .select("id")
    .eq("org_id", ctx.orgId)
    .neq("status", "converted");
  leadsQuery = parsed.data.lead_ids
    ? leadsQuery.in("id", parsed.data.lead_ids)
    : leadsQuery.is("owner_id", null);
  const { data: leads, error: leadsError } = await leadsQuery;
  if (leadsError) return NextResponse.json({ error: leadsError.message }, { status: 500 });
  if (!leads || leads.length === 0) {
    return NextResponse.json({ data: { assigned: 0, assignments: [] } });
  }

  const { data: owned, error: ownedError } = await ctx.supabase
    .from("crm_leads")
    .select("owner_id")
    .eq("org_id", ctx.orgId)
    .neq("status", "converted")
    .not("owner_id", "is", null);
  if (ownedError) return NextResponse.json({ error: ownedError.message }, { status: 500 });

  const counts = new Map<string, number>();
  for (const m of members) counts.set(m.user_id as string, 0);
  for (const row of owned ?? []) {
    const ownerId = row.owner_id as string;
    if (counts.has(ownerId)) counts.set(ownerId, (counts.get(ownerId) ?? 0) + 1);
  }

  const assignments = planRoundRobin(
    leads.map((l) => l.id as string),
    [...counts.entries()].map(([userId, openCount]) => ({ userId, openCount })),
  );

  // Group by assignee to keep this to one update per member, not per lead.
  const byUser = new Map<string, string[]>();
  for (const a of assignments) {
    byUser.set(a.userId, [...(byUser.get(a.userId) ?? []), a.leadId]);
  }
  for (const [userId, leadIds] of byUser) {
    const { error } = await ctx.supabase
      .from("crm_leads")
      .update({ owner_id: userId })
      .eq("org_id", ctx.orgId)
      .in("id", leadIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: { assigned: assignments.length, assignments } });
});
