import { crudCollection } from "@/lib/api/crud-route";
import { contactInput } from "@/lib/services/crm/types";

export const { GET, POST } = crudCollection({
  table: "crm_contacts",
  schema: contactInput,
  select: "*, account:crm_accounts(id, name)",
  ownerField: "owner_id",
});
