import { clinicList } from "@/lib/api/clinic-list";

export const GET = clinicList({
  table: "clinic_appointments",
  select: "id, patient_name, patient_number, appointment_at, doctor, status, notes",
  searchColumns: ["patient_name", "doctor", "status"],
  order: "appointment_at",
  ascending: false,
});
