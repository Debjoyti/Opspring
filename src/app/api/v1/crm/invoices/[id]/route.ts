import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { getRow, updateRow } from "@/lib/services/crm/repository";
import { DELETABLE_STATUSES, EDITABLE_STATUSES } from "@/lib/services/crm/invoices";
import { invoicePatchInput } from "@/lib/services/crm/types";

const INVOICE_SELECT =
  "*, items:crm_invoice_items(*), payments:crm_payments(*), account:crm_accounts(id, name), contact:crm_contacts(id, first_name, last_name, email), deal:crm_deals(id, name), quote:crm_quotes(id, number, title)";

function itemId(req: Request): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  return parts[parts.length - 1];
}

export const GET = withOrgAuth(async (req, ctx) => {
  const row = await getRow(ctx.supabase, "crm_invoices", ctx.orgId, itemId(req), INVOICE_SELECT);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ data: row });
});

export const PATCH = withOrgAuth(async (req, ctx) => {
  const body = await req.json().catch(() => ({}));
  const parsed = invoicePatchInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const id = itemId(req);
  const existing = (await getRow(ctx.supabase, "crm_invoices", ctx.orgId, id, "id, status")) as
    | { id: string; status: string }
    | null;
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!EDITABLE_STATUSES.includes(existing.status)) {
    return NextResponse.json({ error: "invoice_not_editable" }, { status: 409 });
  }

  const row = await updateRow(ctx.supabase, "crm_invoices", ctx.orgId, id, parsed.data);
  return NextResponse.json({ data: row });
});

export const DELETE = withOrgAuth(async (req, ctx) => {
  const id = itemId(req);
  const existing = (await getRow(ctx.supabase, "crm_invoices", ctx.orgId, id, "id, status")) as
    | { id: string; status: string }
    | null;
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!DELETABLE_STATUSES.includes(existing.status)) {
    return NextResponse.json({ error: "invoice_not_deletable" }, { status: 409 });
  }
  const { error } = await ctx.supabase
    .from("crm_invoices")
    .delete()
    .eq("org_id", ctx.orgId)
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
});
