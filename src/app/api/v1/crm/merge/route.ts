import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import type { ApiContext } from "@/lib/api/handler";
import { buildMergePatch } from "@/lib/services/crm/dedupe";
import { mergeInput, type DuplicateResource, type EntityType } from "@/lib/services/crm/types";
import type { CrmTable } from "@/lib/services/crm/repository";

const RESOURCE_CONFIG: Record<
  DuplicateResource,
  { table: CrmTable; entityType: EntityType; mergeFields: string[] }
> = {
  leads: {
    table: "crm_leads",
    entityType: "lead",
    mergeFields: ["company", "email", "phone", "title", "source"],
  },
  contacts: {
    table: "crm_contacts",
    entityType: "contact",
    mergeFields: ["last_name", "email", "phone", "title", "account_id"],
  },
  accounts: {
    table: "crm_accounts",
    entityType: "account",
    mergeFields: ["industry", "website", "phone"],
  },
};

/** Re-points a child table's FK column from the duplicates to the primary. */
async function repoint(
  ctx: ApiContext,
  table: string,
  column: string,
  fromIds: string[],
  toId: string,
  extraFilter?: { column: string; value: string },
) {
  let query = ctx.supabase
    .from(table)
    .update({ [column]: toId })
    .eq("org_id", ctx.orgId)
    .in(column, fromIds);
  if (extraFilter) query = query.eq(extraFilter.column, extraFilter.value);
  const { error } = await query;
  if (error) throw new Error(error.message);
}

/**
 * Merge duplicates into a primary record: fill the primary's empty fields
 * from the duplicates, re-point notes/activities (and entity-specific FKs)
 * at the primary, then delete the duplicates. Ordered so a mid-way failure
 * leaves no dangling references — duplicates are only removed last.
 */
export const POST = withOrgAuth(async (req, ctx) => {
  const body = await req.json().catch(() => ({}));
  const parsed = mergeInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const { resource, primary_id, duplicate_ids } = parsed.data;
  if (duplicate_ids.includes(primary_id)) {
    return NextResponse.json({ error: "primary_in_duplicates" }, { status: 422 });
  }
  const config = RESOURCE_CONFIG[resource];

  const { data: records, error: fetchError } = await ctx.supabase
    .from(config.table)
    .select("*")
    .eq("org_id", ctx.orgId)
    .in("id", [primary_id, ...duplicate_ids]);
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  const primary = records?.find((r) => r.id === primary_id);
  const duplicates = (records ?? []).filter((r) => duplicate_ids.includes(r.id as string));
  if (!primary || duplicates.length !== duplicate_ids.length) {
    return NextResponse.json({ error: "records_not_found" }, { status: 404 });
  }

  try {
    // 1. Children first: notes, activities, entity-specific FKs.
    await repoint(ctx, "crm_notes", "entity_id", duplicate_ids, primary_id, {
      column: "entity_type",
      value: config.entityType,
    });
    await repoint(ctx, "crm_activities", "related_id", duplicate_ids, primary_id, {
      column: "related_type",
      value: config.entityType,
    });
    if (resource === "contacts") {
      await repoint(ctx, "crm_deals", "contact_id", duplicate_ids, primary_id);
    }
    if (resource === "accounts") {
      await repoint(ctx, "crm_contacts", "account_id", duplicate_ids, primary_id);
      await repoint(ctx, "crm_deals", "account_id", duplicate_ids, primary_id);
    }

    // 2. Enrich the primary with anything it was missing.
    const patch = buildMergePatch(primary, duplicates, config.mergeFields);
    if (Object.keys(patch).length > 0) {
      const { error } = await ctx.supabase
        .from(config.table)
        .update(patch)
        .eq("org_id", ctx.orgId)
        .eq("id", primary_id);
      if (error) throw new Error(error.message);
    }

    // 3. Only now remove the duplicates.
    const { error: deleteError } = await ctx.supabase
      .from(config.table)
      .delete()
      .eq("org_id", ctx.orgId)
      .in("id", duplicate_ids);
    if (deleteError) throw new Error(deleteError.message);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "merge_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: { merged: duplicate_ids.length, primary_id } });
});
