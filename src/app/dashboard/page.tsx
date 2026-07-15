import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/dashboard/stat-card";
import { createClient } from "@/lib/supabase/server";
import { resolveActiveOrg } from "@/lib/dashboard/org-context";
import { getCrmOverview } from "@/lib/services/crm/metrics";
import { formatCurrency, titleCase } from "@/lib/format";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const { activeOrg } = await resolveActiveOrg(org);

  const supabase = await createClient();
  const overview = await getCrmOverview(supabase, activeOrg.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{activeOrg.name}</h1>
        <p className="text-sm text-muted-foreground">Company overview</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open pipeline" value={formatCurrency(overview.openPipelineValue)} />
        <StatCard label="Won revenue" value={formatCurrency(overview.wonValue)} />
        <StatCard label="Open leads" value={overview.totals.leads} />
        <StatCard label="Deals" value={overview.totals.deals} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leads by status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(overview.leadsByStatus).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between text-sm">
                <span className="capitalize">{status}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
            <Link
              href={`/dashboard/crm/leads?org=${activeOrg.id}`}
              className="mt-2 inline-block text-sm font-medium underline"
            >
              View leads
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {overview.recentActivities.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <ul className="space-y-2">
                {overview.recentActivities.map((a) => (
                  <li key={a.id} className="flex items-center justify-between text-sm">
                    <span className="truncate">{a.subject}</span>
                    <span className="ml-2 shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                      {titleCase(a.type)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
