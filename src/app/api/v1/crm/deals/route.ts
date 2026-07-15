import { crudCollection } from "@/lib/api/crud-route";
import { dealInput } from "@/lib/services/crm/types";

export const { GET, POST } = crudCollection({
  table: "crm_deals",
  schema: dealInput,
  select: "*, account:crm_accounts(id, name), contact:crm_contacts(id, first_name, last_name)",
  ownerField: "owner_id",
});
