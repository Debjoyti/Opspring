"use client";

import { EntityManager, type ColumnDef, type FieldDef } from "@/components/crm/entity-manager";

type Account = {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  phone: string | null;
};

const fields: FieldDef[] = [
  { name: "name", label: "Name", required: true },
  { name: "industry", label: "Industry" },
  { name: "website", label: "Website", placeholder: "https://…" },
  { name: "phone", label: "Phone", type: "tel" },
];

const columns: ColumnDef<Account>[] = [
  { header: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
  { header: "Industry", render: (r) => r.industry ?? "—" },
  { header: "Website", render: (r) => r.website ?? "—" },
  { header: "Phone", render: (r) => r.phone ?? "—" },
];

export function AccountsClient({ orgId }: { orgId: string }) {
  return (
    <EntityManager<Account>
      resource="accounts"
      orgId={orgId}
      title="Accounts"
      fields={fields}
      columns={columns}
    />
  );
}
