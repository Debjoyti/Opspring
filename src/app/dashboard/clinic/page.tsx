import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/dashboard/stat-card";
import { createClient } from "@/lib/supabase/server";
import { resolveActiveOrg } from "@/lib/dashboard/org-context";
import { getClinicOverview } from "@/lib/services/clinic/metrics";
import { formatCurrency, formatDate, titleCase } from "@/lib/format";

const inr = (n: number) => formatCurrency(n, "INR");

export default async function ClinicOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const { activeOrg } = await resolveActiveOrg(org);

  const supabase = await createClient();
  const o = await getClinicOverview(supabase, activeOrg.id);

  const maxProc = Math.max(1, ...o.topProcedures.map((p) => p.count));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Clinic</h1>
        <p className="text-sm text-muted-foreground">{activeOrg.name}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Collected" value={inr(o.revenue.collected)} hint={`${inr(o.revenue.refunded)} refunded`} />
        <StatCard label="Patients" value={o.totals.patients.toLocaleString("en-IN")} />
        <StatCard
          label="Appointments"
          value={o.totals.appointments.toLocaleString("en-IN")}
          hint={`${o.appointments.upcoming} upcoming`}
        />
        <StatCard label="Today" value={o.appointments.today} hint="appointments" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Top procedures</CardTitle>
            <Link href={`/dashboard/clinic/procedures?org=${activeOrg.id}`} className="text-sm font-medium underline">
              Catalog
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {o.topProcedures.map((p) => (
              <div key={p.name}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="truncate pr-2">{p.name}</span>
                  <span className="shrink-0 text-muted-foreground">{p.count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(p.count / maxProc) * 100}%` }} />
                </div>
              </div>
            ))}
            {o.topProcedures.length === 0 && (
              <p className="text-sm text-muted-foreground">No treatment data yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment modes & recent</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {o.paymentModes.map((m) => (
                <span key={m.mode} className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">
                  {titleCase(m.mode)}: {inr(m.amount)}
                </span>
              ))}
            </div>
            <ul className="divide-y text-sm">
              {o.recentPayments.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-1.5">
                  <span className="truncate pr-2">
                    {p.patient_name ?? "—"}
                    {p.treatment_name ? <span className="text-muted-foreground"> · {p.treatment_name}</span> : null}
                  </span>
                  <span className="shrink-0 font-medium">{inr(p.amount_paid)}</span>
                </li>
              ))}
              {o.recentPayments.length === 0 && <li className="py-2 text-muted-foreground">No payments yet.</li>}
            </ul>
            <Link href={`/dashboard/clinic/billing?org=${activeOrg.id}`} className="inline-block text-sm font-medium underline">
              All payments
            </Link>
          </CardContent>
        </Card>
      </div>

      {o.totals.patients === 0 && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No clinic data loaded yet. Run <code className="rounded bg-muted px-1">npm run import:practo</code> with your
            Practo export to load patients, appointments, treatments, and billing.
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        {formatDate(new Date().toISOString())} · scheduled {o.appointments.scheduled}, cancelled {o.appointments.cancelled}
      </p>
    </div>
  );
}
