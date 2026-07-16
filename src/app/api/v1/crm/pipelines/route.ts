import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { listRows } from "@/lib/services/crm/repository";
import { pipelineCreateInput } from "@/lib/services/crm/types";

const PIPELINE_SELECT =
  "*, stages:crm_pipeline_stages(id, name, position, probability, kind)";

export const GET = withOrgAuth(async (_req, ctx) => {
  const rows = (await listRows(ctx.supabase, "crm_pipelines", ctx.orgId, {
    select: PIPELINE_SELECT,
    order: "position",
    ascending: true,
  })) as unknown as { stages?: { position: number }[] }[];
  for (const row of rows) {
    row.stages?.sort((a, b) => a.position - b.position);
  }
  return NextResponse.json({ data: rows });
});

export const POST = withOrgAuth(async (req, ctx) => {
  const body = await req.json().catch(() => ({}));
  const parsed = pipelineCreateInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  // Only one default per org (enforced by a partial unique index) — demote the
  // current default first if this one claims the flag.
  if (parsed.data.is_default) {
    const { error } = await ctx.supabase
      .from("crm_pipelines")
      .update({ is_default: false })
      .eq("org_id", ctx.orgId)
      .eq("is_default", true);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: pipeline, error: pipelineError } = await ctx.supabase
    .from("crm_pipelines")
    .insert({ org_id: ctx.orgId, name: parsed.data.name, is_default: parsed.data.is_default })
    .select("*")
    .single();
  if (pipelineError) {
    return NextResponse.json({ error: pipelineError.message }, { status: 500 });
  }

  const stages = parsed.data.stages ?? [
    { name: "Qualified", position: 0, probability: 20, kind: "open" as const },
    { name: "Proposal", position: 1, probability: 45, kind: "open" as const },
    { name: "Negotiation", position: 2, probability: 70, kind: "open" as const },
    { name: "Won", position: 3, probability: 100, kind: "won" as const },
    { name: "Lost", position: 4, probability: 0, kind: "lost" as const },
  ];
  const { data: stageRows, error: stageError } = await ctx.supabase
    .from("crm_pipeline_stages")
    .insert(
      stages.map((stage, idx) => ({
        ...stage,
        position: stage.position ?? idx,
        org_id: ctx.orgId,
        pipeline_id: pipeline.id,
      })),
    )
    .select("*");
  if (stageError) {
    // Roll back the half-created pipeline so we never leave one with no stages.
    await ctx.supabase.from("crm_pipelines").delete().eq("id", pipeline.id).eq("org_id", ctx.orgId);
    return NextResponse.json({ error: stageError.message }, { status: 500 });
  }

  return NextResponse.json({ data: { ...pipeline, stages: stageRows } }, { status: 201 });
});
