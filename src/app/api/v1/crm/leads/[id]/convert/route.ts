import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { getRow } from "@/lib/services/crm/repository";
import { convertLeadInput } from "@/lib/services/crm/types";

/** The [id] segment sits before the /convert suffix. */
function leadId(req: Request): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  return parts[parts.length - 2];
}

export const POST = withOrgAuth(async (req, ctx) => {
  const body = await req.json().catch(() => ({}));
  const parsed = convertLeadInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const id = leadId(req);
  // Explicit org check before the RPC — the function itself runs under the
  // caller's RLS too, this just gives a clean 404 instead of a raw error.
  const lead = await getRow(ctx.supabase, "crm_leads", ctx.orgId, id, "id, status");
  if (!lead) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data, error } = await ctx.supabase.rpc("crm_convert_lead", {
    p_lead_id: id,
    p_create_deal: parsed.data.create_deal,
    p_deal_name: parsed.data.deal_name ?? null,
    p_deal_amount: parsed.data.deal_amount,
  });
  if (error) {
    if (error.message.includes("lead_already_converted")) {
      return NextResponse.json({ error: "lead_already_converted" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data });
});
