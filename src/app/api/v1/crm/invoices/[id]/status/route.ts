import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { getRow, updateRow } from "@/lib/services/crm/repository";
import { INVOICE_STATUS_STAMP, INVOICE_TRANSITIONS } from "@/lib/services/crm/invoices";
import { invoiceStatusInput } from "@/lib/services/crm/types";

/** The [id] segment sits before the /status suffix. */
function invoiceId(req: Request): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  return parts[parts.length - 2];
}

export const POST = withOrgAuth(async (req, ctx) => {
  const body = await req.json().catch(() => ({}));
  const parsed = invoiceStatusInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const id = invoiceId(req);
  const invoice = (await getRow(ctx.supabase, "crm_invoices", ctx.orgId, id, "id, status")) as
    | { id: string; status: string }
    | null;
  if (!invoice) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const target = parsed.data.status;
  if (!(INVOICE_TRANSITIONS[invoice.status] ?? []).includes(target)) {
    return NextResponse.json(
      { error: `invalid_transition_${invoice.status}_to_${target}` },
      { status: 409 },
    );
  }

  const values: Record<string, unknown> = { status: target };
  const stamp = INVOICE_STATUS_STAMP[target];
  if (stamp) values[stamp] = new Date().toISOString();

  const row = await updateRow(ctx.supabase, "crm_invoices", ctx.orgId, id, values);
  return NextResponse.json({ data: row });
});
