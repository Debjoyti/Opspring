import { crudItem } from "@/lib/api/crud-route";
import { dealInput } from "@/lib/services/crm/types";

export const { GET, PATCH, DELETE } = crudItem({
  table: "crm_deals",
  schema: dealInput,
});
