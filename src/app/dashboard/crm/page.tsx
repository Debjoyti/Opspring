import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/dashboard/stat-card";
import { createClient } from "@/lib/supabase/server";
import { resolveActiveOrg } from "@/lib/dashboard/org-context";
import { getCrmOverview } from "@/lib/services/crm/metrics";
import { formatCurrency } from "@/lib/format";

export default async function CrmOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const { activeOrg } = await resolveActiveOrg(org);

  const supabase = await createClient();
  const overview = await getCrmOverview(supabase, activeOrg.id);

  const maxStageValue = Math.max(1, ...overview.stageBreakdown.map((s) => s.value));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">CRM</h1>
        <p className="text-sm text-muted-foreground">{activeOrg.name}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open pipeline" value={formatCurrency(overview.openPipelineValue)} />
        <StatCard
          label="Weighted forecast"
          value={formatCurrency(Math.round(overview.weightedForecast))}
        />
        <StatCard label="Won revenue" value={formatCurrency(overview.wonValue)} />
        <StatCard
          label="Open tasks"
          value={
            overview.overdueTasks > 0
              ? `${overview.openTasks} (${overview.overdueTasks} overdue)`
              : overview.openTasks
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Pipeline by stage</CardTitle>
            <Link
              href={`/dashboard/crm/deals?org=${activeOrg.id}`}
              className="text-sm font-medium underline"
            >
              Open board
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.stageBreakdown.map((s) => (
              <div key={s.id}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span>
                    {s.name}
                    {s.kind === "open" && (
                      <span className="ml-1 text-xs text-muted-foreground">{s.probability}%</span>
                    )}
                  </span>
                  <span className="text-muted-foreground">
                    {s.count} · {formatCurrency(s.value)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(s.value / maxStageValue) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Leads by status</CardTitle>
            <Link
              href={`/dashboard/crm/leads?org=${activeOrg.id}`}
              className="text-sm font-medium underline"
            >
              View leads
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(overview.leadsByStatus).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between text-sm">
                <span className="capitalize">{status}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
