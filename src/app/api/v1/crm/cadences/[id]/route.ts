import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { deleteRow, updateRow } from "@/lib/services/crm/repository";
import { cadencePatchInput } from "@/lib/services/crm/types";

function itemId(req: Request): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  return parts[parts.length - 1];
}

export const PATCH = withOrgAuth(async (req, ctx) => {
  const body = await req.json().catch(() => ({}));
  const parsed = cadencePatchInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const row = await updateRow(ctx.supabase, "crm_cadences", ctx.orgId, itemId(req), parsed.data);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ data: row });
});

export const DELETE = withOrgAuth(async (req, ctx) => {
  await deleteRow(ctx.supabase, "crm_cadences", ctx.orgId, itemId(req));
  return NextResponse.json({ ok: true });
});
