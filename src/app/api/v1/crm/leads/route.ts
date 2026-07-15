import { crudCollection } from "@/lib/api/crud-route";
import { leadInput } from "@/lib/services/crm/types";

export const { GET, POST } = crudCollection({
  table: "crm_leads",
  schema: leadInput,
  ownerField: "owner_id",
});
