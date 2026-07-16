"use client";

import { Badge } from "@/components/ui/badge";
import { EntityManager, type ColumnDef, type FieldDef } from "@/components/crm/entity-manager";
import { ACTIVITY_TYPES } from "@/lib/services/crm/types";

type Activity = {
  id: string;
  type: string;
  subject: string;
  notes: string | null;
  done: boolean;
  created_at: string;
};

const fields: FieldDef[] = [
  {
    name: "type",
    label: "Type",
    type: "select",
    options: ACTIVITY_TYPES.map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) })),
  },
  { name: "subject", label: "Subject", required: true },
  { name: "notes", label: "Notes", type: "textarea" },
];

const columns: ColumnDef<Activity>[] = [
  {
    header: "Type",
    render: (r) => <Badge variant="secondary" className="capitalize">{r.type}</Badge>,
  },
  { header: "Subject", render: (r) => <span className="font-medium">{r.subject}</span> },
  { header: "Notes", render: (r) => <span className="line-clamp-1">{r.notes ?? "—"}</span> },
];

export function ActivitiesClient({ orgId }: { orgId: string }) {
  return (
    <EntityManager<Activity>
      resource="activities"
      orgId={orgId}
      title="Activities"
      fields={fields}
      columns={columns}
    />
  );
}
