import { crudCollection } from "@/lib/api/crud-route";
import { templateInput } from "@/lib/services/crm/types";

export const { GET, POST } = crudCollection({
  table: "crm_email_templates",
  schema: templateInput,
  ownerField: "owner_id",
});
