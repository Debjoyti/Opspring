import type { SupabaseClient } from "@supabase/supabase-js";
import { LEAD_STATUSES, type LeadStatus, type StageKind } from "./types";

export type StageBreakdown = {
  id: string;
  name: string;
  kind: StageKind;
  probability: number;
  count: number;
  value: number;
  weighted: number;
};

export type CrmOverview = {
  totals: { leads: number; accounts: number; contacts: number; deals: number };
  openPipelineValue: number;
  weightedForecast: number;
  wonValue: number;
  openTasks: number;
  overdueTasks: number;
  leadsByStatus: Record<LeadStatus, number>;
  avgLeadScore: number | null;
  stageBreakdown: StageBreakdown[];
  recentActivities: {
    id: string;
    type: string;
    subject: string;
    created_at: string;
    done: boolean;
  }[];
};

/**
 * Single aggregation pass for the CRM overview dashboard. Runs entirely
 * through the caller's RLS-scoped client, so it only ever sees this org's
 * rows. Aggregation is done in JS over lightweight column selects — fine at
 * this scale; promote to a Postgres function if row counts grow large.
 */
export async function getCrmOverview(
  supabase: SupabaseClient,
  orgId: string,
): Promise<CrmOverview> {
  const nowIso = new Date().toISOString();
  const [leads, deals, stages, accountsCount, contactsCount, activities, openTasks, overdueTasks] =
    await Promise.all([
      supabase.from("crm_leads").select("status, score").eq("org_id", orgId),
      supabase.from("crm_deals").select("stage_id, amount").eq("org_id", orgId),
      supabase
        .from("crm_pipeline_stages")
        .select("id, name, kind, probability, position, pipeline_id, crm_pipelines!inner(is_default)")
        .eq("org_id", orgId)
        .order("position", { ascending: true }),
      supabase.from("crm_accounts").select("id", { count: "exact", head: true }).eq("org_id", orgId),
      supabase.from("crm_contacts").select("id", { count: "exact", head: true }).eq("org_id", orgId),
      supabase
        .from("crm_activities")
        .select("id, type, subject, created_at, done")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("crm_activities")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("type", "task")
        .eq("done", false),
      supabase
        .from("crm_activities")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("type", "task")
        .eq("done", false)
        .lt("due_at", nowIso),
    ]);

  const leadsByStatus = Object.fromEntries(
    LEAD_STATUSES.map((s) => [s, 0]),
  ) as Record<LeadStatus, number>;
  let scoreSum = 0;
  let scoreCount = 0;
  for (const row of leads.data ?? []) {
    const status = row.status as LeadStatus;
    if (status in leadsByStatus) leadsByStatus[status] += 1;
    if (typeof row.score === "number") {
      scoreSum += row.score;
      scoreCount += 1;
    }
  }

  type StageMeta = {
    id: string;
    name: string;
    kind: StageKind;
    probability: number;
    isDefaultPipeline: boolean;
  };
  const stageMeta = new Map<string, StageMeta>();
  for (const row of stages.data ?? []) {
    const pipelines = row.crm_pipelines as unknown as { is_default: boolean } | { is_default: boolean }[];
    const isDefault = Array.isArray(pipelines)
      ? pipelines.some((p) => p.is_default)
      : Boolean(pipelines?.is_default);
    stageMeta.set(row.id as string, {
      id: row.id as string,
      name: row.name as string,
      kind: row.kind as StageKind,
      probability: Number(row.probability ?? 0),
      isDefaultPipeline: isDefault,
    });
  }

  const perStage = new Map<string, { count: number; value: number }>();
  let openPipelineValue = 0;
  let weightedForecast = 0;
  let wonValue = 0;
  for (const row of deals.data ?? []) {
    const meta = stageMeta.get(row.stage_id as string);
    const amount = Number(row.amount ?? 0);
    if (!meta) continue;
    const agg = perStage.get(meta.id) ?? { count: 0, value: 0 };
    agg.count += 1;
    agg.value += amount;
    perStage.set(meta.id, agg);
    if (meta.kind === "open") {
      openPipelineValue += amount;
      weightedForecast += (amount * meta.probability) / 100;
    }
    if (meta.kind === "won") wonValue += amount;
  }

  // The overview chart shows the default pipeline's stages (in order), so it
  // stays readable even when an org runs several pipelines.
  const stageBreakdown: StageBreakdown[] = (stages.data ?? [])
    .filter((row) => stageMeta.get(row.id as string)?.isDefaultPipeline)
    .map((row) => {
      const meta = stageMeta.get(row.id as string)!;
      const agg = perStage.get(meta.id) ?? { count: 0, value: 0 };
      return {
        id: meta.id,
        name: meta.name,
        kind: meta.kind,
        probability: meta.probability,
        count: agg.count,
        value: agg.value,
        weighted: meta.kind === "open" ? (agg.value * meta.probability) / 100 : 0,
      };
    });

  return {
    totals: {
      leads: (leads.data ?? []).length,
      accounts: accountsCount.count ?? 0,
      contacts: contactsCount.count ?? 0,
      deals: (deals.data ?? []).length,
    },
    openPipelineValue,
    weightedForecast,
    wonValue,
    openTasks: openTasks.count ?? 0,
    overdueTasks: overdueTasks.count ?? 0,
    leadsByStatus,
    avgLeadScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null,
    stageBreakdown,
    recentActivities: (activities.data ?? []) as CrmOverview["recentActivities"],
  };
}
