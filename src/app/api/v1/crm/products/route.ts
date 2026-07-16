import { crudCollection } from "@/lib/api/crud-route";
import { productInput } from "@/lib/services/crm/types";

export const { GET, POST } = crudCollection({
  table: "crm_products",
  schema: productInput,
  ownerField: "owner_id",
});
