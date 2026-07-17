import { clinicList } from "@/lib/api/clinic-list";

export const GET = clinicList({
  table: "clinic_payments",
  select: "id, patient_number, receipt_number, treatment_name, amount_paid, invoice_number, payment_mode, refund, cancelled, paid_on",
  searchColumns: ["patient_number", "receipt_number", "treatment_name", "invoice_number"],
  order: "paid_on",
  ascending: false,
});
