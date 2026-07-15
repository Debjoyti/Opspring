"use client";

import { Badge } from "@/components/ui/badge";
import { EntityManager, type ColumnDef, type FieldDef } from "@/components/crm/entity-manager";
import { LEAD_STATUSES } from "@/lib/services/crm/types";

type Lead = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: string;
};

const fields: FieldDef[] = [
  { name: "name", label: "Name", required: true },
  { name: "company", label: "Company" },
  { name: "email", label: "Email", type: "email" },
  { name: "phone", label: "Phone", type: "tel" },
  { name: "source", label: "Source", placeholder: "Website, referral, event…" },
  {
    name: "status",
    label: "Status",
    type: "select",
    options: LEAD_STATUSES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })),
  },
];

const columns: ColumnDef<Lead>[] = [
  { header: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
  { header: "Company", render: (r) => r.company ?? "—" },
  { header: "Email", render: (r) => r.email ?? "—" },
  { header: "Source", render: (r) => r.source ?? "—" },
  {
    header: "Status",
    render: (r) => <Badge variant="secondary" className="capitalize">{r.status}</Badge>,
  },
];

export function LeadsClient({ orgId }: { orgId: string }) {
  return (
    <EntityManager<Lead>
      resource="leads"
      orgId={orgId}
      title="Leads"
      fields={fields}
      columns={columns}
    />
  );
}
