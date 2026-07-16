import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { insertRow, listRows } from "@/lib/services/crm/repository";
import {
  DEAL_SELECT,
  getStage,
  resolveStageDefaults,
  stageSideEffects,
} from "@/lib/services/crm/deals";
import { dealInput } from "@/lib/services/crm/types";

export const GET = withOrgAuth(async (_req, ctx) => {
  const rows = await listRows(ctx.supabase, "crm_deals", ctx.orgId, {
    select: DEAL_SELECT,
  });
  return NextResponse.json({ data: rows });
});

export const POST = withOrgAuth(async (req, ctx) => {
  const body = await req.json().catch(() => ({}));
  const parsed = dealInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  let placement;
  try {
    placement = await resolveStageDefaults(ctx.supabase, ctx.orgId, parsed.data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "stage_resolution_failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const stage = await getStage(ctx.supabase, ctx.orgId, placement.stage_id);
  const values: Record<string, unknown> = {
    ...parsed.data,
    ...placement,
    ...(stage ? stageSideEffects(stage.kind) : {}),
    owner_id: ctx.userId,
  };
  const row = await insertRow(ctx.supabase, "crm_deals", ctx.orgId, values);
  return NextResponse.json({ data: row }, { status: 201 });
});
