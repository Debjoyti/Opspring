import { crudItem } from "@/lib/api/crud-route";
import { accountInput } from "@/lib/services/crm/types";

export const { GET, PATCH, DELETE } = crudItem({
  table: "crm_accounts",
  schema: accountInput,
});
