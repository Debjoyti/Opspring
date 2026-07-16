import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { getRow } from "@/lib/services/crm/repository";
import { buildMergeVars, renderTemplate } from "@/lib/services/crm/templates";
import { templateRenderInput } from "@/lib/services/crm/types";

/** The [id] segment sits before the /render suffix. */
function templateId(req: Request): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  return parts[parts.length - 2];
}

export const POST = withOrgAuth(async (req, ctx) => {
  const body = await req.json().catch(() => ({}));
  const parsed = templateRenderInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const template = (await getRow(
    ctx.supabase,
    "crm_email_templates",
    ctx.orgId,
    templateId(req),
    "id, subject, body",
  )) as { id: string; subject: string; body: string } | null;
  if (!template) return NextResponse.json({ error: "template_not_found" }, { status: 404 });

  const { entity_type, entity_id } = parsed.data;
  let record: Record<string, unknown> | null = null;
  if (entity_type === "lead") {
    record = (await getRow(
      ctx.supabase,
      "crm_leads",
      ctx.orgId,
      entity_id,
    )) as Record<string, unknown> | null;
  } else {
    record = (await getRow(
      ctx.supabase,
      "crm_contacts",
      ctx.orgId,
      entity_id,
      "*, account:crm_accounts(id, name)",
    )) as Record<string, unknown> | null;
  }
  if (!record) return NextResponse.json({ error: "record_not_found" }, { status: 404 });

  const vars = buildMergeVars(entity_type, record);
  const subject = renderTemplate(template.subject, vars);
  const bodyResult = renderTemplate(template.body, vars);

  return NextResponse.json({
    data: {
      subject: subject.text,
      body: bodyResult.text,
      to: vars.email || null,
      missing: [...new Set([...subject.missing, ...bodyResult.missing])],
    },
  });
});
