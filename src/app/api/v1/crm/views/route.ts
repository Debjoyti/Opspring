import { crudCollection } from "@/lib/api/crud-route";
import { savedViewInput } from "@/lib/services/crm/types";

// RLS additionally scopes reads/writes to user_id = auth.uid(), so these are
// personal views even though the route shape is the standard org one.
export const { GET, POST } = crudCollection({
  table: "crm_saved_views",
  schema: savedViewInput,
  ownerField: "user_id",
});
