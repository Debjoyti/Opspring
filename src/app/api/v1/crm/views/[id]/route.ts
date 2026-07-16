import { crudItem } from "@/lib/api/crud-route";
import { savedViewInput } from "@/lib/services/crm/types";

export const { GET, PATCH, DELETE } = crudItem({
  table: "crm_saved_views",
  schema: savedViewInput,
});
