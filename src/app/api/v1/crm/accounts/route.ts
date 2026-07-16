import { crudCollection } from "@/lib/api/crud-route";
import { accountInput } from "@/lib/services/crm/types";

export const { GET, POST } = crudCollection({
  table: "crm_accounts",
  schema: accountInput,
  ownerField: "owner_id",
});
