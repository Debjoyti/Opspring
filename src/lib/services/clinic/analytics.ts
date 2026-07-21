import type { SupabaseClient } from "@supabase/supabase-js";
import { detectAnomalies, forecastSeries, type Anomaly, type Forecast, type Point } from "./forecast";

export type ClinicAnalytics = {
  range: { fromMonth: string; toMonth: string; months: number };
  kpis: {
    totalCollected: number;
    payments: number;
    avgTicket: number;
    activePatients: number;
    revenuePerPatient: number;
    appointments: number;
    cancellationRate: number;
  };
  revenueByMonth: Point[];
  appointmentsByDay: Point[];
  topProceduresByRevenue: { name: string; revenue: number; count: number }[];
  practitionerLoad: { doctor: string; appointments: number; share: number }[];
  paymentModeMix: { mode: string; amount: number; share: number }[];
  forecast: { revenue: Forecast; horizonLabels: string[] };
  anomalies: Anomaly[];
  insights: Insight[];
};

export type Insight = {
  kind: "positive" | "warning" | "neutral";
  title: string;
  detail: string;
};

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}
function nextMonths(lastKey: string, count: number): string[] {
  const [y, m] = lastKey.split("-").map(Number);
  return Array.from({ length: count }, (_, k) => {
    const d = new Date(Date.UTC(y, m - 1 + k + 1, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}
/** Fill gaps so a quiet month reads as ₹0, not a missing point (matters for trend/forecast). */
function denseMonths(map: Map<string, number>): Point[] {
  const keys = [...map.keys()].sort();
  if (keys.length === 0) return [];
  const out: Point[] = [];
  const [sy, sm] = keys[0].split("-").map(Number);
  const [ey, em] = keys[keys.length - 1].split("-").map(Number);
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push({ label: key, value: Math.round(map.get(key) ?? 0) });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/**
 * Full analytics rollup for the clinic dashboard. Runs through the caller's
 * RLS-scoped client. Pulls just the columns each metric needs, aggregates in
 * JS, then layers the forecast / anomaly / insight primitives on top.
 */
export async function getClinicAnalytics(
  supabase: SupabaseClient,
  orgId: string,
): Promise<ClinicAnalytics> {
  const [payments, appts] = await Promise.all([
    supabase
      .from("clinic_payments")
      .select("amount_paid, payment_mode, paid_on, treatment_name, patient_number, cancelled")
      .eq("org_id", orgId)
      .not("paid_on", "is", null)
      .limit(5000),
    supabase
      .from("clinic_appointments")
      .select("appointment_at, doctor, status")
      .eq("org_id", orgId)
      .not("appointment_at", "is", null)
      .limit(5000),
  ]);

  const pays = (payments.data ?? []).filter((p) => !p.cancelled);
  const appointments = appts.data ?? [];

  // Revenue by month + rollups.
  const revByMonth = new Map<string, number>();
  const revByProc = new Map<string, { revenue: number; count: number }>();
  const byMode = new Map<string, number>();
  const patients = new Set<string>();
  let totalCollected = 0;
  for (const p of pays) {
    const amt = Number(p.amount_paid ?? 0);
    totalCollected += amt;
    revByMonth.set(monthKey(p.paid_on), (revByMonth.get(monthKey(p.paid_on)) ?? 0) + amt);
    const proc = p.treatment_name ?? "Other";
    const cur = revByProc.get(proc) ?? { revenue: 0, count: 0 };
    cur.revenue += amt;
    cur.count += 1;
    revByProc.set(proc, cur);
    const mode = (p.payment_mode ?? "unknown").toLowerCase();
    byMode.set(mode, (byMode.get(mode) ?? 0) + amt);
    if (p.patient_number) patients.add(p.patient_number);
  }

  const revenueByMonth = denseMonths(revByMonth);

  // Appointments by day + practitioner load + cancellation rate.
  const apptByDay = new Map<string, number>();
  const byDoctor = new Map<string, number>();
  let cancelled = 0;
  for (const a of appointments) {
    const day = a.appointment_at!.slice(0, 10);
    apptByDay.set(day, (apptByDay.get(day) ?? 0) + 1);
    const doc = a.doctor ?? "Unassigned";
    byDoctor.set(doc, (byDoctor.get(doc) ?? 0) + 1);
    if ((a.status ?? "").toLowerCase() === "cancelled") cancelled += 1;
  }
  const appointmentsByDay = [...apptByDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([label, value]) => ({ label, value }));

  const totalAppts = appointments.length;
  const practitionerLoad = [...byDoctor.entries()]
    .map(([doctor, appointmentsCount]) => ({
      doctor,
      appointments: appointmentsCount,
      share: totalAppts ? appointmentsCount / totalAppts : 0,
    }))
    .sort((a, b) => b.appointments - a.appointments);

  const paymentModeMix = [...byMode.entries()]
    .map(([mode, amount]) => ({ mode, amount, share: totalCollected ? amount / totalCollected : 0 }))
    .sort((a, b) => b.amount - a.amount);

  const topProceduresByRevenue = [...revByProc.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  // Forecast next 3 months of revenue; drop the current (partial) month so a
  // half-finished month doesn't drag the trend down.
  const nowMonth = monthKey(new Date().toISOString());
  const forecastInput = revenueByMonth.filter((p) => p.label < nowMonth);
  const revenueForecast = forecastSeries(forecastInput.map((p) => p.value), 3);
  const horizonLabels = forecastInput.length
    ? nextMonths(forecastInput[forecastInput.length - 1].label, 3)
    : [];

  const anomalies = detectAnomalies(forecastInput);

  const kpis = {
    totalCollected,
    payments: pays.length,
    avgTicket: pays.length ? totalCollected / pays.length : 0,
    activePatients: patients.size,
    revenuePerPatient: patients.size ? totalCollected / patients.size : 0,
    appointments: totalAppts,
    cancellationRate: totalAppts ? cancelled / totalAppts : 0,
  };

  const insights = buildInsights({
    revenueForecast,
    anomalies,
    topProceduresByRevenue,
    practitionerLoad,
    paymentModeMix,
    kpis,
    horizonLabels,
  });

  const fromMonth = revenueByMonth[0]?.label ?? "";
  const toMonth = revenueByMonth[revenueByMonth.length - 1]?.label ?? "";

  return {
    range: { fromMonth, toMonth, months: revenueByMonth.length },
    kpis,
    revenueByMonth,
    appointmentsByDay,
    topProceduresByRevenue,
    practitionerLoad,
    paymentModeMix,
    forecast: { revenue: revenueForecast, horizonLabels },
    anomalies,
    insights,
  };
}

/**
 * Deterministic, grounded insight generation — an expert-system layer over the
 * computed metrics. Every statement is derived from a real number above, so it
 * can't hallucinate. (The optional LLM narrative in ai-narrative.ts consumes
 * this same grounding when a gateway key is configured.)
 */
export function buildInsights(ctx: {
  revenueForecast: Forecast;
  anomalies: Anomaly[];
  topProceduresByRevenue: { name: string; revenue: number; count: number }[];
  practitionerLoad: { doctor: string; appointments: number; share: number }[];
  paymentModeMix: { mode: string; amount: number; share: number }[];
  kpis: ClinicAnalytics["kpis"];
  horizonLabels: string[];
}): Insight[] {
  const out: Insight[] = [];
  const { revenueForecast: f, anomalies, topProceduresByRevenue, practitionerLoad, paymentModeMix, kpis } = ctx;

  // Trend + forecast.
  if (f.predictions.length && ctx.horizonLabels.length) {
    const pct = f.nextChangePct;
    const pctText = pct == null ? "" : ` (${pct >= 0 ? "+" : ""}${pct.toFixed(0)}% vs last month)`;
    out.push({
      kind: f.direction === "down" ? "warning" : f.direction === "up" ? "positive" : "neutral",
      title:
        f.direction === "up"
          ? "Revenue trending up"
          : f.direction === "down"
            ? "Revenue trending down"
            : "Revenue holding steady",
      detail: `Projected ${ctx.horizonLabels[0]}: ${inr(f.predictions[0])}${pctText}. Trend fit R²=${f.fit.r2.toFixed(2)}.`,
    });
  }

  // Anomalies.
  if (anomalies.length) {
    const big = [...anomalies].sort((a, b) => Math.abs(b.z) - Math.abs(a.z))[0];
    out.push({
      kind: big.z > 0 ? "positive" : "warning",
      title: `Unusual month: ${big.label}`,
      detail: `${inr(big.value)} is ${Math.abs(big.z).toFixed(1)}σ ${big.z > 0 ? "above" : "below"} the average month — worth understanding what drove it.`,
    });
  }

  // Revenue concentration (single-procedure dependency risk).
  const total = topProceduresByRevenue.reduce((a, b) => a + b.revenue, 0);
  if (total > 0 && topProceduresByRevenue[0]) {
    const top = topProceduresByRevenue[0];
    const share = top.revenue / total;
    out.push({
      kind: share > 0.5 ? "warning" : "neutral",
      title: `${top.name} is the top earner`,
      detail:
        `${inr(top.revenue)} (${(share * 100).toFixed(0)}% of tracked revenue).` +
        (share > 0.5 ? " High concentration — diversifying services reduces risk." : ""),
    });
  }

  // Practitioner utilisation balance.
  if (practitionerLoad.length >= 2) {
    const top = practitionerLoad[0];
    out.push({
      kind: top.share > 0.5 ? "warning" : "neutral",
      title: `${top.doctor} carries the most appointments`,
      detail:
        `${top.appointments} appts (${(top.share * 100).toFixed(0)}% of the schedule).` +
        (top.share > 0.5 ? " Load is concentrated — consider rebalancing to avoid burnout and bottlenecks." : ""),
    });
  }

  // Cancellation rate.
  if (kpis.appointments >= 10) {
    out.push({
      kind: kpis.cancellationRate > 0.1 ? "warning" : "positive",
      title: `Cancellation rate ${(kpis.cancellationRate * 100).toFixed(1)}%`,
      detail:
        kpis.cancellationRate > 0.1
          ? "Above 10% — reminders or a confirmation step could recover revenue."
          : "Healthy — patients are keeping their appointments.",
    });
  }

  // Cash-collection risk (untracked/unknown payment mode).
  const unknown = paymentModeMix.find((m) => m.mode === "unknown");
  if (unknown && unknown.share > 0.25) {
    out.push({
      kind: "warning",
      title: "Large share of payments untagged",
      detail: `${(unknown.share * 100).toFixed(0)}% of collections have no recorded payment mode — tightening this improves reconciliation.`,
    });
  }

  return out;
}
