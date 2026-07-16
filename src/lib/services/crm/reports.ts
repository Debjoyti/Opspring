import type { SupabaseClient } from "@supabase/supabase-js";
import { LEAD_STATUSES, type LeadStatus, type StageKind } from "./types";

export type CrmReports = {
  funnel: {
    byStatus: { status: LeadStatus; count: number }[];
    total: number;
    conversionRate: number; // converted / total, 0..1
  };
  winLoss: {
    months: {
      month: string; // YYYY-MM
      wonCount: number;
      wonValue: number;
      lostCount: number;
      lostValue: number;
    }[];
    winRate: number; // won / (won + lost), 0..1
    topLostReasons: { reason: string; count: number }[];
  };
  velocity: {
    avgCycleDays: number | null; // created -> closed, won deals
    avgWonAmount: number | null;
    avgOpenAgeDays: number | null;
  };
  pipelines: {
    id: string;
    name: string;
    openValue: number;
    weightedValue: number;
    stages: {
      id: string;
      name: string;
      kind: StageKind;
      probability: number;
      count: number;
      value: number;
      weighted: number;
    }[];
  }[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function lastMonths(count: number, now: Date): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    keys.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  }
  return keys;
}

/** All CRM reports in one pass; same JS-side aggregation approach as metrics. */
export async function getCrmReports(
  supabase: SupabaseClient,
  orgId: string,
  now = new Date(),
): Promise<CrmReports> {
  const [leadsRes, dealsRes, stagesRes, pipelinesRes] = await Promise.all([
    supabase.from("crm_leads").select("status").eq("org_id", orgId),
    supabase
      .from("crm_deals")
      .select("amount, stage_id, pipeline_id, created_at, closed_at, lost_reason")
      .eq("org_id", orgId),
    supabase
      .from("crm_pipeline_stages")
      .select("id, pipeline_id, name, kind, probability, position")
      .eq("org_id", orgId)
      .order("position", { ascending: true }),
    supabase
      .from("crm_pipelines")
      .select("id, name, is_default, position")
      .eq("org_id", orgId)
      .order("is_default", { ascending: false })
      .order("position", { ascending: true }),
  ]);
  for (const res of [leadsRes, dealsRes, stagesRes, pipelinesRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  const leads = leadsRes.data ?? [];
  const deals = dealsRes.data ?? [];
  const stages = stagesRes.data ?? [];
  const pipelines = pipelinesRes.data ?? [];

  // Funnel ---------------------------------------------------------------
  const byStatus = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) as Record<
    LeadStatus,
    number
  >;
  for (const lead of leads) {
    const status = lead.status as LeadStatus;
    if (status in byStatus) byStatus[status] += 1;
  }
  const totalLeads = leads.length;

  // Stage lookup -----------------------------------------------------------
  const stageById = new Map(
    stages.map((s) => [
      s.id as string,
      {
        kind: s.kind as StageKind,
        probability: Number(s.probability ?? 0),
      },
    ]),
  );

  // Win/loss by month (last 6 months) --------------------------------------
  const monthKeys = lastMonths(6, now);
  const monthAgg = new Map(
    monthKeys.map((key) => [
      key,
      { month: key, wonCount: 0, wonValue: 0, lostCount: 0, lostValue: 0 },
    ]),
  );
  let wonTotal = 0;
  let lostTotal = 0;
  const lostReasons = new Map<string, number>();
  let cycleSumDays = 0;
  let cycleCount = 0;
  let wonAmountSum = 0;
  let openAgeSumDays = 0;
  let openCount = 0;

  for (const deal of deals) {
    const stage = stageById.get(deal.stage_id as string);
    if (!stage) continue;
    const amount = Number(deal.amount ?? 0);

    if (stage.kind === "open") {
      openCount += 1;
      openAgeSumDays += (now.getTime() - new Date(deal.created_at).getTime()) / DAY_MS;
      continue;
    }

    const closedAt = deal.closed_at ? new Date(deal.closed_at) : null;
    if (stage.kind === "won") {
      wonTotal += 1;
      wonAmountSum += amount;
      if (closedAt) {
        cycleSumDays += (closedAt.getTime() - new Date(deal.created_at).getTime()) / DAY_MS;
        cycleCount += 1;
        const agg = monthAgg.get(monthKey(closedAt));
        if (agg) {
          agg.wonCount += 1;
          agg.wonValue += amount;
        }
      }
    } else {
      lostTotal += 1;
      const reason = (deal.lost_reason ?? "").trim();
      if (reason) lostReasons.set(reason, (lostReasons.get(reason) ?? 0) + 1);
      if (closedAt) {
        const agg = monthAgg.get(monthKey(closedAt));
        if (agg) {
          agg.lostCount += 1;
          agg.lostValue += amount;
        }
      }
    }
  }

  // Per-pipeline breakdown ---------------------------------------------------
  const perStage = new Map<string, { count: number; value: number }>();
  for (const deal of deals) {
    const agg = perStage.get(deal.stage_id as string) ?? { count: 0, value: 0 };
    agg.count += 1;
    agg.value += Number(deal.amount ?? 0);
    perStage.set(deal.stage_id as string, agg);
  }

  const pipelineReports = pipelines.map((pipeline) => {
    const pipelineStages = stages.filter((s) => s.pipeline_id === pipeline.id);
    let openValue = 0;
    let weightedValue = 0;
    const stageRows = pipelineStages.map((s) => {
      const agg = perStage.get(s.id as string) ?? { count: 0, value: 0 };
      const kind = s.kind as StageKind;
      const probability = Number(s.probability ?? 0);
      const weighted = kind === "open" ? (agg.value * probability) / 100 : 0;
      if (kind === "open") {
        openValue += agg.value;
        weightedValue += weighted;
      }
      return {
        id: s.id as string,
        name: s.name as string,
        kind,
        probability,
        count: agg.count,
        value: agg.value,
        weighted,
      };
    });
    return {
      id: pipeline.id as string,
      name: pipeline.name as string,
      openValue,
      weightedValue,
      stages: stageRows,
    };
  });

  return {
    funnel: {
      byStatus: LEAD_STATUSES.map((status) => ({ status, count: byStatus[status] })),
      total: totalLeads,
      conversionRate: totalLeads > 0 ? byStatus.converted / totalLeads : 0,
    },
    winLoss: {
      months: monthKeys.map((key) => monthAgg.get(key)!),
      winRate: wonTotal + lostTotal > 0 ? wonTotal / (wonTotal + lostTotal) : 0,
      topLostReasons: [...lostReasons.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    },
    velocity: {
      avgCycleDays: cycleCount > 0 ? Math.round((cycleSumDays / cycleCount) * 10) / 10 : null,
      avgWonAmount: wonTotal > 0 ? Math.round(wonAmountSum / wonTotal) : null,
      avgOpenAgeDays: openCount > 0 ? Math.round((openAgeSumDays / openCount) * 10) / 10 : null,
    },
    pipelines: pipelineReports,
  };
}
