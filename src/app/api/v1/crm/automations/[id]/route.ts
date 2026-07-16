import { crudItem } from "@/lib/api/crud-route";
import { automationRuleInput } from "@/lib/services/crm/types";

export const { GET, PATCH, DELETE } = crudItem({
  table: "crm_automation_rules",
  schema: automationRuleInput,
});
