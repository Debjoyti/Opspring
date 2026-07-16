import { crudCollection } from "@/lib/api/crud-route";
import { runAutomations } from "@/lib/services/crm/automation";
import { leadInput } from "@/lib/services/crm/types";

export const { GET, POST } = crudCollection({
  table: "crm_leads",
  schema: leadInput,
  ownerField: "owner_id",
  afterCreate: (ctx, row) =>
    runAutomations(ctx.supabase, ctx.orgId, ctx.userId, "lead_created", {
      entityType: "lead",
      entityId: row.id as string,
    }),
});
