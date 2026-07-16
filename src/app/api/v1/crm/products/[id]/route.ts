import { crudItem } from "@/lib/api/crud-route";
import { productInput } from "@/lib/services/crm/types";

export const { GET, PATCH, DELETE } = crudItem({
  table: "crm_products",
  schema: productInput,
});
