import { clinicList } from "@/lib/api/clinic-list";

export const GET = clinicList({
  table: "clinic_procedures",
  select: "id, name, cost, notes",
  searchColumns: ["name"],
  order: "name",
  ascending: true,
  defaultLimit: 200,
});
