import { crudItem } from "@/lib/api/crud-route";
import { lineItemInput } from "@/lib/services/crm/types";

export const { GET, PATCH, DELETE } = crudItem({
  table: "crm_quote_items",
  schema: lineItemInput,
});
