import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { scoreLead } from "@/lib/services/crm/scoring";
import { scoreLeadsInput } from "@/lib/services/crm/types";

const BATCH_LIMIT = 25;

/**
 * Scores the given leads (or the oldest unscored, unconverted leads, up to
 * 25 per call). Uses the AI Gateway when configured, deterministic rules
 * otherwise; the source is stored alongside the score.
 */
export const POST = withOrgAuth(async (req, ctx) => {
  const body = await req.json().catch(() => ({}));
  const parsed = scoreLeadsInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  let query = ctx.supabase
    .from("crm_leads")
    .select("id, name, company, email, phone, title, source, status")
    .eq("org_id", ctx.orgId)
    .limit(BATCH_LIMIT);
  query = parsed.data.ids
    ? query.in("id", parsed.data.ids)
    : query.is("score", null).neq("status", "converted").order("created_at", { ascending: true });
  const { data: leads, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!leads || leads.length === 0) {
    return NextResponse.json({ data: { scored: [] } });
  }

  // One activity-count query for the whole batch.
  const { data: activityRows } = await ctx.supabase
    .from("crm_activities")
    .select("related_id")
    .eq("org_id", ctx.orgId)
    .eq("related_type", "lead")
    .in("related_id", leads.map((l) => l.id as string));
  const activityCounts = new Map<string, number>();
  for (const row of activityRows ?? []) {
    const id = row.related_id as string;
    activityCounts.set(id, (activityCounts.get(id) ?? 0) + 1);
  }

  const scored = await Promise.all(
    leads.map(async (lead) => {
      const result = await scoreLead({
        name: lead.name as string,
        company: lead.company as string | null,
        email: lead.email as string | null,
        phone: lead.phone as string | null,
        title: lead.title as string | null,
        source: lead.source as string | null,
        status: lead.status as string,
        activityCount: activityCounts.get(lead.id as string) ?? 0,
      });
      const { error: updateError } = await ctx.supabase
        .from("crm_leads")
        .update({
          score: result.score,
          score_source: result.source,
          score_reason: result.reason,
          scored_at: new Date().toISOString(),
        })
        .eq("org_id", ctx.orgId)
        .eq("id", lead.id);
      if (updateError) throw new Error(updateError.message);
      return { id: lead.id, ...result };
    }),
  );

  return NextResponse.json({ data: { scored } });
});
