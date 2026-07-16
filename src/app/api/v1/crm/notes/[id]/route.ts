import { crudItem } from "@/lib/api/crud-route";
import { noteInput } from "@/lib/services/crm/types";

export const { GET, PATCH, DELETE } = crudItem({
  table: "crm_notes",
  schema: noteInput,
});
