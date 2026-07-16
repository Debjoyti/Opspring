import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { getRow, insertRow } from "@/lib/services/crm/repository";
import { EDITABLE_STATUSES } from "@/lib/services/crm/invoices";
import { lineItemInput } from "@/lib/services/crm/types";

/** The [id] segment sits before the /items suffix. */
function invoiceId(req: Request): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  return parts[parts.length - 2];
}

export const POST = withOrgAuth(async (req, ctx) => {
  const body = await req.json().catch(() => ({}));
  const parsed = lineItemInput.safeParse(body);
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
  if (!invoice) return NextResponse.json({ error: "invoice_not_found" }, { status: 404 });
  if (!EDITABLE_STATUSES.includes(invoice.status)) {
    return NextResponse.json({ error: "invoice_not_editable" }, { status: 409 });
  }

  const row = await insertRow(ctx.supabase, "crm_invoice_items", ctx.orgId, {
    ...parsed.data,
    invoice_id: id,
  });
  return NextResponse.json({ data: row }, { status: 201 });
});
