import { crudItem } from "@/lib/api/crud-route";
import { templateInput } from "@/lib/services/crm/types";

export const { GET, PATCH, DELETE } = crudItem({
  table: "crm_email_templates",
  schema: templateInput,
});
