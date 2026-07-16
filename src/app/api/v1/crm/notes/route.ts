import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { insertRow, listRows } from "@/lib/services/crm/repository";
import { ENTITY_TYPES, noteInput } from "@/lib/services/crm/types";

export const GET = withOrgAuth(async (req, ctx) => {
  const url = new URL(req.url);
  const entityType = url.searchParams.get("entity_type");
  const entityId = url.searchParams.get("entity_id");
  const filters: Record<string, string> = {};
  if (entityType) {
    if (!(ENTITY_TYPES as readonly string[]).includes(entityType)) {
      return NextResponse.json({ error: "invalid_entity_type" }, { status: 422 });
    }
    filters.entity_type = entityType;
  }
  if (entityId) filters.entity_id = entityId;

  const rows = await listRows(ctx.supabase, "crm_notes", ctx.orgId, { filters, limit: 200 });
  return NextResponse.json({ data: rows });
});

export const POST = withOrgAuth(async (req, ctx) => {
  const body = await req.json().catch(() => ({}));
  const parsed = noteInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const row = await insertRow(ctx.supabase, "crm_notes", ctx.orgId, {
    ...parsed.data,
    author_id: ctx.userId,
  });
  return NextResponse.json({ data: row }, { status: 201 });
});
