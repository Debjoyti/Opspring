import { clinicList } from "@/lib/api/clinic-list";

export const GET = clinicList({
  table: "clinic_patients",
  select: "id, patient_number, name, mobile, email, gender, city, age, blood_group, created_at",
  searchColumns: ["name", "mobile", "patient_number", "email"],
  order: "name",
  ascending: true,
});
