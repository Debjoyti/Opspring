import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { getRow, insertRow } from "@/lib/services/crm/repository";
import { stageInput } from "@/lib/services/crm/types";

export const POST = withOrgAuth(async (req, ctx) => {
  const body = await req.json().catch(() => ({}));
  const parsed = stageInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  // The pipeline must exist in this org (RLS enforces it again underneath).
  const pipeline = await getRow(
    ctx.supabase,
    "crm_pipelines",
    ctx.orgId,
    parsed.data.pipeline_id,
    "id",
  );
  if (!pipeline) return NextResponse.json({ error: "pipeline_not_found" }, { status: 422 });

  const row = await insertRow(ctx.supabase, "crm_pipeline_stages", ctx.orgId, parsed.data);
  return NextResponse.json({ data: row }, { status: 201 });
});
