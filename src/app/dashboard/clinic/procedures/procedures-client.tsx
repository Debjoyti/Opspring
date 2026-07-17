"use client";

import { ClinicTable, type Column } from "@/components/clinic/clinic-table";
import { formatCurrency } from "@/lib/format";

type Procedure = { id: string; name: string; cost: number; notes: string | null };

const columns: Column<Procedure>[] = [
  { header: "Procedure", render: (r) => <span className="font-medium">{r.name}</span> },
  { header: "Cost", render: (r) => formatCurrency(Number(r.cost ?? 0), "INR"), className: "text-right" },
  { header: "Notes", render: (r) => r.notes ?? "—" },
];

export function ProceduresClient({ orgId }: { orgId: string }) {
  return (
    <ClinicTable<Procedure>
      orgId={orgId}
      resource="procedures"
      title="Procedure catalog"
      columns={columns}
      searchPlaceholder="Search procedures…"
      limit={200}
    />
  );
}
