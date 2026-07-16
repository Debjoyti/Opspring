import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { deleteRow, getRow, updateRow } from "@/lib/services/crm/repository";
import { DEAL_SELECT, getStage, stageSideEffects } from "@/lib/services/crm/deals";
import { dealInput } from "@/lib/services/crm/types";

function itemId(req: Request): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  return parts[parts.length - 1];
}

export const GET = withOrgAuth(async (req, ctx) => {
  const row = await getRow(ctx.supabase, "crm_deals", ctx.orgId, itemId(req), DEAL_SELECT);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ data: row });
});

export const PATCH = withOrgAuth(async (req, ctx) => {
  const body = await req.json().catch(() => ({}));
  const parsed = dealInput.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const values: Record<string, unknown> = { ...parsed.data };

  // A stage move re-derives pipeline_id and the close state from the target
  // stage, so a deal can't land in a stage from another pipeline (or another
  // org — getStage is org-scoped and RLS-checked underneath).
  if (parsed.data.stage_id) {
    const stage = await getStage(ctx.supabase, ctx.orgId, parsed.data.stage_id);
    if (!stage) return NextResponse.json({ error: "stage_not_found" }, { status: 422 });
    values.pipeline_id = stage.pipeline_id;
    const effects = stageSideEffects(stage.kind);
    Object.assign(values, effects);
    // An explicit lost_reason in the same request wins over the reset.
    if (parsed.data.lost_reason) values.lost_reason = parsed.data.lost_reason;
  }

  const row = await updateRow(ctx.supabase, "crm_deals", ctx.orgId, itemId(req), values);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ data: row });
});

export const DELETE = withOrgAuth(async (req, ctx) => {
  await deleteRow(ctx.supabase, "crm_deals", ctx.orgId, itemId(req));
  return NextResponse.json({ ok: true });
});
