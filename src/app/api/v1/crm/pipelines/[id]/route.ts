import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { updateRow } from "@/lib/services/crm/repository";
import { pipelinePatchInput } from "@/lib/services/crm/types";

function itemId(req: Request): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  return parts[parts.length - 1];
}

export const PATCH = withOrgAuth(async (req, ctx) => {
  const body = await req.json().catch(() => ({}));
  const parsed = pipelinePatchInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  if (parsed.data.is_default) {
    const { error } = await ctx.supabase
      .from("crm_pipelines")
      .update({ is_default: false })
      .eq("org_id", ctx.orgId)
      .eq("is_default", true);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const row = await updateRow(ctx.supabase, "crm_pipelines", ctx.orgId, itemId(req), parsed.data);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ data: row });
});

export const DELETE = withOrgAuth(async (req, ctx) => {
  const id = itemId(req);

  const { count } = await ctx.supabase
    .from("crm_pipelines")
    .select("id", { count: "exact", head: true })
    .eq("org_id", ctx.orgId);
  if ((count ?? 0) <= 1) {
    return NextResponse.json({ error: "cannot_delete_last_pipeline" }, { status: 409 });
  }

  const { error } = await ctx.supabase
    .from("crm_pipelines")
    .delete()
    .eq("org_id", ctx.orgId)
    .eq("id", id);
  if (error) {
    // FK restrict: deals still reference this pipeline's stages.
    const isRestricted = error.code === "23503";
    return NextResponse.json(
      { error: isRestricted ? "pipeline_has_deals" : error.message },
      { status: isRestricted ? 409 : 500 },
    );
  }
  return NextResponse.json({ ok: true });
});
