import { crudItem } from "@/lib/api/crud-route";
import { contactInput } from "@/lib/services/crm/types";

export const { GET, PATCH, DELETE } = crudItem({
  table: "crm_contacts",
  schema: contactInput,
});
