import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { updateRow } from "@/lib/services/crm/repository";
import { stageDef } from "@/lib/services/crm/types";

function itemId(req: Request): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  return parts[parts.length - 1];
}

export const PATCH = withOrgAuth(async (req, ctx) => {
  const body = await req.json().catch(() => ({}));
  // pipeline_id is deliberately not patchable — stages don't move between pipelines.
  const parsed = stageDef.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const row = await updateRow(
    ctx.supabase,
    "crm_pipeline_stages",
    ctx.orgId,
    itemId(req),
    parsed.data,
  );
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ data: row });
});

export const DELETE = withOrgAuth(async (req, ctx) => {
  const { error } = await ctx.supabase
    .from("crm_pipeline_stages")
    .delete()
    .eq("org_id", ctx.orgId)
    .eq("id", itemId(req));
  if (error) {
    const isRestricted = error.code === "23503";
    return NextResponse.json(
      { error: isRestricted ? "stage_has_deals" : error.message },
      { status: isRestricted ? 409 : 500 },
    );
  }
  return NextResponse.json({ ok: true });
});
