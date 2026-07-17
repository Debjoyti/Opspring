"use client";

import { Badge } from "@/components/ui/badge";
import { ClinicTable, type Column } from "@/components/clinic/clinic-table";
import { formatCurrency, formatDate, titleCase } from "@/lib/format";

type Payment = {
  id: string;
  patient_number: string | null;
  receipt_number: string | null;
  treatment_name: string | null;
  amount_paid: number;
  invoice_number: string | null;
  payment_mode: string | null;
  refund: boolean;
  cancelled: boolean;
  paid_on: string | null;
};

const columns: Column<Payment>[] = [
  { header: "Date", render: (r) => formatDate(r.paid_on) },
  { header: "Patient #", render: (r) => r.patient_number ?? "—" },
  { header: "For", render: (r) => r.treatment_name ?? "—" },
  { header: "Mode", render: (r) => (r.payment_mode ? titleCase(r.payment_mode) : "—") },
  {
    header: "Amount",
    className: "text-right",
    render: (r) => (
      <span className={r.cancelled ? "text-muted-foreground line-through" : "font-medium"}>
        {formatCurrency(Number(r.amount_paid ?? 0), "INR")}
      </span>
    ),
  },
  {
    header: "",
    render: (r) =>
      r.refund ? (
        <Badge variant="destructive">Refund</Badge>
      ) : r.cancelled ? (
        <Badge variant="secondary">Cancelled</Badge>
      ) : null,
  },
];

export function BillingClient({ orgId }: { orgId: string }) {
  return (
    <ClinicTable<Payment>
      orgId={orgId}
      resource="payments"
      title="Billing & payments"
      columns={columns}
      searchPlaceholder="Search by patient #, receipt, invoice, treatment…"
    />
  );
}
