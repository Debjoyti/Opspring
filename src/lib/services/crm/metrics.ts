import type { SupabaseClient } from "@supabase/supabase-js";
import { DEAL_STAGES, LEAD_STATUSES, OPEN_STAGES, type DealStage, type LeadStatus } from "./types";

export type CrmOverview = {
  totals: { leads: number; accounts: number; contacts: number; deals: number };
  openPipelineValue: number;
  wonValue: number;
  leadsByStatus: Record<LeadStatus, number>;
  dealsByStage: Record<DealStage, { count: number; value: number }>;
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
  const [leads, deals, accountsCount, contactsCount, activities] = await Promise.all([
    supabase.from("crm_leads").select("status").eq("org_id", orgId),
    supabase.from("crm_deals").select("stage, amount").eq("org_id", orgId),
    supabase.from("crm_accounts").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase.from("crm_contacts").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase
      .from("crm_activities")
      .select("id, type, subject, created_at, done")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const leadsByStatus = Object.fromEntries(
    LEAD_STATUSES.map((s) => [s, 0]),
  ) as Record<LeadStatus, number>;
  for (const row of leads.data ?? []) {
    const status = row.status as LeadStatus;
    if (status in leadsByStatus) leadsByStatus[status] += 1;
  }

  const dealsByStage = Object.fromEntries(
    DEAL_STAGES.map((s) => [s, { count: 0, value: 0 }]),
  ) as Record<DealStage, { count: number; value: number }>;
  let openPipelineValue = 0;
  let wonValue = 0;
  for (const row of deals.data ?? []) {
    const stage = row.stage as DealStage;
    const amount = Number(row.amount ?? 0);
    if (stage in dealsByStage) {
      dealsByStage[stage].count += 1;
      dealsByStage[stage].value += amount;
    }
    if ((OPEN_STAGES as string[]).includes(stage)) openPipelineValue += amount;
    if (stage === "won") wonValue += amount;
  }

  return {
    totals: {
      leads: (leads.data ?? []).length,
      accounts: accountsCount.count ?? 0,
      contacts: contactsCount.count ?? 0,
      deals: (deals.data ?? []).length,
    },
    openPipelineValue,
    wonValue,
    leadsByStatus,
    dealsByStage,
    recentActivities: (activities.data ?? []) as CrmOverview["recentActivities"],
  };
}
