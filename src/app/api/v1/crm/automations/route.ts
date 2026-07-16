import { crudCollection } from "@/lib/api/crud-route";
import { automationRuleInput } from "@/lib/services/crm/types";

export const { GET, POST } = crudCollection({
  table: "crm_automation_rules",
  schema: automationRuleInput,
  ownerField: "owner_id",
});
