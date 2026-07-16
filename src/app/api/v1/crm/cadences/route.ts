import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { listRows } from "@/lib/services/crm/repository";
import { cadenceInput } from "@/lib/services/crm/types";

const CADENCE_SELECT =
  "*, steps:crm_cadence_steps(id, position, day_offset, activity_type, subject), enrollments:crm_cadence_enrollments(id)";

export const GET = withOrgAuth(async (_req, ctx) => {
  const rows = (await listRows(ctx.supabase, "crm_cadences", ctx.orgId, {
    select: CADENCE_SELECT,
  })) as unknown as { steps?: { position: number }[] }[];
  for (const row of rows) row.steps?.sort((a, b) => a.position - b.position);
  return NextResponse.json({ data: rows });
});

export const POST = withOrgAuth(async (req, ctx) => {
  const body = await req.json().catch(() => ({}));
  const parsed = cadenceInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const { steps, ...cadenceFields } = parsed.data;
  if (!steps || steps.length === 0) {
    return NextResponse.json({ error: "steps_required" }, { status: 422 });
  }

  const { data: cadence, error } = await ctx.supabase
    .from("crm_cadences")
    .insert({ ...cadenceFields, org_id: ctx.orgId, owner_id: ctx.userId })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: stepRows, error: stepError } = await ctx.supabase
    .from("crm_cadence_steps")
    .insert(
      steps.map((step, idx) => ({
        ...step,
        position: step.position ?? idx,
        org_id: ctx.orgId,
        cadence_id: cadence.id,
      })),
    )
    .select("*");
  if (stepError) {
    await ctx.supabase.from("crm_cadences").delete().eq("org_id", ctx.orgId).eq("id", cadence.id);
    return NextResponse.json({ error: stepError.message }, { status: 500 });
  }

  return NextResponse.json({ data: { ...cadence, steps: stepRows } }, { status: 201 });
});
