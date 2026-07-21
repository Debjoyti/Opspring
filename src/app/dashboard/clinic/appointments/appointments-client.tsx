"use client";

import { Badge } from "@/components/ui/badge";
import { ClinicTable, type Column } from "@/components/clinic/clinic-table";

type Appointment = {
  id: string;
  patient_name: string | null;
  appointment_at: string | null;
  doctor: string | null;
  status: string | null;
};

function fmt(dt: string | null): string {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const columns: Column<Appointment>[] = [
  { header: "When", render: (r) => fmt(r.appointment_at) },
  { header: "Patient", render: (r) => <span className="font-medium">{r.patient_name ?? "—"}</span> },
  { header: "Practitioner", render: (r) => r.doctor ?? "—" },
  {
    header: "Status",
    render: (r) =>
      r.status ? (
        <Badge variant={r.status.toLowerCase() === "cancelled" ? "destructive" : "secondary"} className="capitalize">
          {r.status}
        </Badge>
      ) : (
        "—"
      ),
  },
];

export function AppointmentsClient({ orgId }: { orgId: string }) {
  return (
    <ClinicTable<Appointment>
      orgId={orgId}
      resource="appointments"
      title="Appointments"
      hideTitle
      columns={columns}
      searchPlaceholder="Search by patient, practitioner, status…"
    />
  );
}
