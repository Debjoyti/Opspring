import { crudCollection } from "@/lib/api/crud-route";
import { activityInput } from "@/lib/services/crm/types";

export const { GET, POST } = crudCollection({
  table: "crm_activities",
  schema: activityInput,
  ownerField: "actor_id",
});
