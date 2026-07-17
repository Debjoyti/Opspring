import type { SupabaseClient } from "@supabase/supabase-js";

export type ClinicOverview = {
  totals: { patients: number; appointments: number; treatments: number };
  revenue: { collected: number; refunded: number };
  paymentModes: { mode: string; count: number; amount: number }[];
  appointments: { today: number; upcoming: number; scheduled: number; cancelled: number };
  topProcedures: { name: string; count: number }[];
  recentPayments: {
    id: string;
    patient_name: string | null;
    treatment_name: string | null;
    amount_paid: number;
    payment_mode: string | null;
    paid_on: string | null;
  }[];
};

/**
 * Overview aggregation for the clinic dashboard. Runs through the caller's
 * RLS-scoped client (only ever this org's rows). Counts use head+count so we
 * never pull the full 13k appointment / 6k payment rows into memory; the
 * money/mode/procedure rollups pull just the columns they need.
 */
export async function getClinicOverview(
  supabase: SupabaseClient,
  orgId: string,
): Promise<ClinicOverview> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const nowIso = new Date().toISOString();

  const [
    patientsCount,
    appointmentsCount,
    treatmentsCount,
    scheduledCount,
    cancelledCount,
    todayCount,
    upcomingCount,
    payments,
    treatmentNames,
    recentPayments,
  ] = await Promise.all([
    supabase.from("clinic_patients").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase.from("clinic_appointments").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase.from("clinic_treatments").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase.from("clinic_appointments").select("id", { count: "exact", head: true }).eq("org_id", orgId).ilike("status", "scheduled"),
    supabase.from("clinic_appointments").select("id", { count: "exact", head: true }).eq("org_id", orgId).ilike("status", "cancelled"),
    supabase.from("clinic_appointments").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("appointment_at", todayStart.toISOString()).lt("appointment_at", todayEnd.toISOString()),
    supabase.from("clinic_appointments").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("appointment_at", nowIso),
    supabase.from("clinic_payments").select("amount_paid, refunded_amount, payment_mode, cancelled").eq("org_id", orgId),
    supabase.from("clinic_treatments").select("treatment_name").eq("org_id", orgId),
    supabase.from("clinic_payments").select("id, treatment_name, amount_paid, payment_mode, paid_on, patient:clinic_patients(name)").eq("org_id", orgId).order("paid_on", { ascending: false }).limit(10),
  ]);

  let collected = 0;
  let refunded = 0;
  const modeMap = new Map<string, { count: number; amount: number }>();
  for (const p of payments.data ?? []) {
    if (p.cancelled) continue;
    const amt = Number(p.amount_paid ?? 0);
    collected += amt;
    refunded += Number(p.refunded_amount ?? 0);
    const mode = (p.payment_mode ?? "unknown").toLowerCase();
    const m = modeMap.get(mode) ?? { count: 0, amount: 0 };
    m.count += 1;
    m.amount += amt;
    modeMap.set(mode, m);
  }

  const procMap = new Map<string, number>();
  for (const t of treatmentNames.data ?? []) {
    const name = t.treatment_name ?? "Unnamed";
    procMap.set(name, (procMap.get(name) ?? 0) + 1);
  }

  return {
    totals: {
      patients: patientsCount.count ?? 0,
      appointments: appointmentsCount.count ?? 0,
      treatments: treatmentsCount.count ?? 0,
    },
    revenue: { collected, refunded },
    paymentModes: [...modeMap.entries()]
      .map(([mode, v]) => ({ mode, ...v }))
      .sort((a, b) => b.amount - a.amount),
    appointments: {
      today: todayCount.count ?? 0,
      upcoming: upcomingCount.count ?? 0,
      scheduled: scheduledCount.count ?? 0,
      cancelled: cancelledCount.count ?? 0,
    },
    topProcedures: [...procMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    recentPayments: (recentPayments.data ?? []).map((p) => ({
      id: p.id,
      patient_name: (p.patient as { name?: string } | null)?.name ?? null,
      treatment_name: p.treatment_name,
      amount_paid: Number(p.amount_paid ?? 0),
      payment_mode: p.payment_mode,
      paid_on: p.paid_on,
    })),
  };
}
