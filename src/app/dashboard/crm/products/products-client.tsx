"use client";

import { Badge } from "@/components/ui/badge";
import { EntityManager, type ColumnDef, type FieldDef } from "@/components/crm/entity-manager";
import { BILLING_INTERVALS } from "@/lib/services/crm/types";
import { formatCurrency } from "@/lib/format";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  unit_price: number;
  currency: string;
  billing_interval: string;
  active: boolean;
};

const INTERVAL_LABEL: Record<string, string> = {
  one_time: "One-time",
  monthly: "Monthly",
  yearly: "Yearly",
};

const fields: FieldDef[] = [
  { name: "name", label: "Name", required: true },
  { name: "sku", label: "SKU" },
  { name: "unit_price", label: "Unit price", type: "number" },
  {
    name: "billing_interval",
    label: "Billing",
    type: "select",
    options: BILLING_INTERVALS.map((i) => ({ value: i, label: INTERVAL_LABEL[i] })),
  },
  { name: "currency", label: "Currency", defaultValue: "USD" },
  { name: "description", label: "Description", type: "textarea", hideInTable: true },
  { name: "active", label: "Active (available on quotes and deals)", type: "checkbox" },
];

const columns: ColumnDef<Product>[] = [
  { header: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
  { header: "SKU", render: (r) => r.sku ?? "—" },
  {
    header: "Price",
    render: (r) => formatCurrency(Number(r.unit_price ?? 0), r.currency),
  },
  {
    header: "Billing",
    render: (r) => INTERVAL_LABEL[r.billing_interval] ?? r.billing_interval,
  },
  {
    header: "Status",
    render: (r) =>
      r.active ? (
        <Badge variant="secondary">active</Badge>
      ) : (
        <Badge variant="outline">inactive</Badge>
      ),
  },
];

export function ProductsClient({ orgId }: { orgId: string }) {
  return (
    <EntityManager<Product>
      resource="products"
      orgId={orgId}
      title="Products"
      fields={fields}
      columns={columns}
    />
  );
}
