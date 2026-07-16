"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/dashboard/stat-card";
import { useCrmReports } from "@/lib/crm/client";
import type { CrmReports } from "@/lib/services/crm/reports";
import { formatCurrency } from "@/lib/format";

function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    month: "short",
  });
}

export function ReportsClient({ orgId }: { orgId: string }) {
  const { data, isLoading, error } = useCrmReports<CrmReports>(orgId);

  if (isLoading) return <p className="text-sm text-muted-foreground">Crunching numbers…</p>;
  if (error || !data) return <p className="text-sm text-destructive">Failed to load reports.</p>;

  const { funnel, winLoss, velocity, pipelines } = data;
  const maxMonthValue = Math.max(
    1,
    ...winLoss.months.map((m) => Math.max(m.wonValue, m.lostValue)),
  );
  const maxFunnelCount = Math.max(1, ...funnel.byStatus.map((s) => s.count));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Funnel, win/loss, velocity, and pipeline forecasts.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Lead conversion" value={pct(funnel.conversionRate)} />
        <StatCard label="Win rate" value={pct(winLoss.winRate)} />
        <StatCard
          label="Avg. sales cycle"
          value={velocity.avgCycleDays !== null ? `${velocity.avgCycleDays} days` : "—"}
        />
        <StatCard
          label="Avg. won deal"
          value={velocity.avgWonAmount !== null ? formatCurrency(velocity.avgWonAmount) : "—"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lead funnel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {funnel.byStatus.map(({ status, count }) => (
              <div key={status}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="capitalize">{status}</span>
                  <span className="text-muted-foreground">{count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(count / maxFunnelCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              {funnel.total} leads total · {pct(funnel.conversionRate)} converted
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Won vs. lost (last 6 months)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between gap-2" style={{ height: 160 }}>
              {winLoss.months.map((m) => (
                <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex w-full flex-1 items-end justify-center gap-1">
                    <div
                      className="w-3 rounded-t bg-emerald-600"
                      title={`Won ${formatCurrency(m.wonValue)} (${m.wonCount})`}
                      style={{ height: `${(m.wonValue / maxMonthValue) * 100}%`, minHeight: m.wonCount > 0 ? 4 : 0 }}
                    />
                    <div
                      className="w-3 rounded-t bg-destructive"
                      title={`Lost ${formatCurrency(m.lostValue)} (${m.lostCount})`}
                      style={{ height: `${(m.lostValue / maxMonthValue) * 100}%`, minHeight: m.lostCount > 0 ? 4 : 0 }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{monthLabel(m.month)}</span>
                </div>
              ))}
            </div>
            {winLoss.topLostReasons.length > 0 && (
              <div className="mt-4 space-y-1">
                <p className="text-xs font-medium">Top loss reasons</p>
                {winLoss.topLostReasons.map((r) => (
                  <div key={r.reason} className="flex justify-between text-xs text-muted-foreground">
                    <span>{r.reason}</span>
                    <span>{r.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {pipelines.map((pipeline) => (
          <Card key={pipeline.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span>{pipeline.name}</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {formatCurrency(pipeline.openValue)} open ·{" "}
                  {formatCurrency(Math.round(pipeline.weightedValue))} weighted
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {pipeline.stages.map((stage) => {
                const maxValue = Math.max(1, ...pipeline.stages.map((s) => s.value));
                return (
                  <div key={stage.id}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span>
                        {stage.name}
                        {stage.kind === "open" && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            {stage.probability}%
                          </span>
                        )}
                      </span>
                      <span className="text-muted-foreground">
                        {stage.count} · {formatCurrency(stage.value)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-secondary">
                      <div
                        className={`h-full rounded-full ${
                          stage.kind === "won"
                            ? "bg-emerald-600"
                            : stage.kind === "lost"
                              ? "bg-destructive"
                              : "bg-primary"
                        }`}
                        style={{ width: `${(stage.value / maxValue) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Avg. open deal age:{" "}
        {velocity.avgOpenAgeDays !== null ? `${velocity.avgOpenAgeDays} days` : "—"}
      </p>
    </div>
  );
}
