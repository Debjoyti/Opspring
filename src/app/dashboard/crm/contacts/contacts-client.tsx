"use client";

import { EntityManager, type ColumnDef, type FieldDef } from "@/components/crm/entity-manager";

type Contact = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
};

const fields: FieldDef[] = [
  { name: "first_name", label: "First name", required: true },
  { name: "last_name", label: "Last name" },
  { name: "email", label: "Email", type: "email" },
  { name: "phone", label: "Phone", type: "tel" },
  { name: "title", label: "Job title" },
];

const columns: ColumnDef<Contact>[] = [
  {
    header: "Name",
    render: (r) => (
      <span className="font-medium">
        {[r.first_name, r.last_name].filter(Boolean).join(" ")}
      </span>
    ),
  },
  { header: "Title", render: (r) => r.title ?? "—" },
  { header: "Email", render: (r) => r.email ?? "—" },
  { header: "Phone", render: (r) => r.phone ?? "—" },
];

export function ContactsClient({ orgId }: { orgId: string }) {
  return (
    <EntityManager<Contact>
      resource="contacts"
      orgId={orgId}
      title="Contacts"
      fields={fields}
      columns={columns}
    />
  );
}
