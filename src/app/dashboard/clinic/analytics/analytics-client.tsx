"use client";

import { Sparkles, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/dashboard/stat-card";
import { LineChart } from "@/components/charts/line-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { useClinicAnalytics } from "@/lib/clinic/client";

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
const inrShort = (n: number) => {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(0)}k`;
  return `₹${Math.round(n)}`;
};
const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
};

export function AnalyticsClient({ orgId, orgName }: { orgId: string; orgName: string }) {
  const { data: a, isLoading, error } = useClinicAnalytics(orgId);

  if (isLoading) return <p className="text-sm text-muted-foreground">Crunching metrics…</p>;
  if (error || !a) return <p className="text-sm text-destructive">Failed to load analytics.</p>;

  const revData = a.revenueByMonth.map((p) => ({ label: monthLabel(p.label), value: p.value }));
  const forecastData = a.forecast.horizonLabels.map((label, i) => ({
    label: monthLabel(label),
    value: a.forecast.revenue.predictions[i] ?? 0,
  }));
  const apptBars = a.appointmentsByDay.slice(-21).map((p) => ({
    label: new Date(`${p.label}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", timeZone: "UTC" }),
    value: p.value,
  }));
  const maxProc = Math.max(1, ...a.topProceduresByRevenue.map((p) => p.revenue));
  const dir = a.forecast.revenue.direction;
  const DirIcon = dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : Minus;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          {orgName}
          {a.range.months > 0 && ` · ${monthLabel(a.range.fromMonth)} – ${monthLabel(a.range.toMonth)}`}
        </p>
      </div>

      {/* AI Insights */}
      <Card className="border-primary/30 bg-primary/[0.03]">
        <CardHeader className="flex-row items-center gap-2 pb-2">
          <Sparkles className="size-4 text-primary" />
          <CardTitle className="text-base">AI Insights</CardTitle>
          <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-wide text-secondary-foreground">
            {a.narrative.available ? "LLM + rules" : "rule-based"}
          </span>
        </CardHeader>
        <CardContent className="space-y-3">
          {a.narrative.available && a.narrative.text && (
            <p className="rounded-md bg-background/60 p-3 text-sm leading-relaxed">{a.narrative.text}</p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {a.insights.map((ins, i) => {
              const Icon =
                ins.kind === "warning" ? AlertTriangle : ins.kind === "positive" ? CheckCircle2 : Info;
              const color =
                ins.kind === "warning"
                  ? "text-amber-600"
                  : ins.kind === "positive"
                    ? "text-emerald-600"
                    : "text-muted-foreground";
              return (
                <div key={i} className="flex gap-2 rounded-md border bg-background p-2.5">
                  <Icon className={`mt-0.5 size-4 shrink-0 ${color}`} />
                  <div>
                    <div className="text-sm font-medium">{ins.title}</div>
                    <div className="text-xs text-muted-foreground">{ins.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
          {!a.narrative.available && (
            <p className="text-xs text-muted-foreground">
              Set <code className="rounded bg-muted px-1">AI_GATEWAY_API_KEY</code> to add an LLM-written executive
              summary on top of these grounded metrics.
            </p>
          )}
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Collected (tracked)" value={inrShort(a.kpis.totalCollected)} hint={`${a.kpis.payments} payments`} />
        <StatCard label="Avg ticket" value={inr(Math.round(a.kpis.avgTicket))} />
        <StatCard label="Revenue / patient" value={inr(Math.round(a.kpis.revenuePerPatient))} hint={`${a.kpis.activePatients} patients`} />
        <StatCard
          label="Cancellation rate"
          value={`${(a.kpis.cancellationRate * 100).toFixed(1)}%`}
          hint={`${a.kpis.appointments} appts`}
        />
      </div>

      {/* Revenue trend + forecast */}
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Monthly revenue & 3-month forecast</CardTitle>
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <DirIcon className="size-4" />
            {dir === "up" ? "trending up" : dir === "down" ? "trending down" : "flat"}
            {a.forecast.revenue.nextChangePct != null &&
              ` · ${a.forecast.revenue.nextChangePct >= 0 ? "+" : ""}${a.forecast.revenue.nextChangePct.toFixed(0)}%`}
          </span>
        </CardHeader>
        <CardContent>
          <LineChart data={revData} forecast={forecastData} format={inrShort} valueLabel="" />
          <p className="mt-2 text-xs text-muted-foreground">
            Solid = actual · dashed = least-squares forecast (R²={a.forecast.revenue.fit.r2.toFixed(2)}).
            {a.anomalies.length > 0 &&
              ` ${a.anomalies.length} anomalous month${a.anomalies.length === 1 ? "" : "s"} flagged (>2σ).`}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Top procedures by revenue */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top procedures by revenue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {a.topProceduresByRevenue.map((p) => (
              <div key={p.name}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="truncate pr-2">{p.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {inrShort(p.revenue)} · {p.count}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(p.revenue / maxProc) * 100}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Practitioner load + payment mix */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Practitioner load & payment mix</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {a.practitionerLoad.slice(0, 6).map((d) => (
                <div key={d.doctor} className="flex items-center gap-2 text-sm">
                  <span className="w-40 truncate">{d.doctor}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${d.share * 100}%` }} />
                  </div>
                  <span className="w-16 text-right text-xs text-muted-foreground">
                    {d.appointments} · {(d.share * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 border-t pt-3">
              {a.paymentModeMix.map((m) => (
                <span key={m.mode} className="rounded-full bg-secondary px-2.5 py-1 text-xs capitalize text-secondary-foreground">
                  {m.mode}: {inrShort(m.amount)} ({(m.share * 100).toFixed(0)}%)
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Appointment volume */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Appointment volume (last 21 days with data)</CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart data={apptBars} />
        </CardContent>
      </Card>
    </div>
  );
}
