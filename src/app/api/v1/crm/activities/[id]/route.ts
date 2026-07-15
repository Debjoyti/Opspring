import { crudItem } from "@/lib/api/crud-route";
import { activityInput } from "@/lib/services/crm/types";

export const { GET, PATCH, DELETE } = crudItem({
  table: "crm_activities",
  schema: activityInput,
});
