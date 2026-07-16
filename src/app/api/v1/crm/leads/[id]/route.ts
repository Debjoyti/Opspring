import { crudItem } from "@/lib/api/crud-route";
import { leadInput } from "@/lib/services/crm/types";

export const { GET, PATCH, DELETE } = crudItem({
  table: "crm_leads",
  schema: leadInput,
});
