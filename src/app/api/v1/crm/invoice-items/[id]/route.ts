import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import type { ApiContext } from "@/lib/api/handler";
import { deleteRow, updateRow } from "@/lib/services/crm/repository";
import { EDITABLE_STATUSES } from "@/lib/services/crm/invoices";
import { lineItemInput } from "@/lib/services/crm/types";

function itemId(req: Request): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  return parts[parts.length - 1];
}

/** Items are only mutable while their parent invoice is still a draft. */
async function parentIsEditable(ctx: ApiContext, id: string): Promise<boolean | null> {
  const { data, error } = await ctx.supabase
    .from("crm_invoice_items")
    .select("id, invoice:crm_invoices(status)")
    .eq("org_id", ctx.orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const invoice = data.invoice as unknown as { status: string } | null;
  return invoice ? EDITABLE_STATUSES.includes(invoice.status) : false;
}

export const PATCH = withOrgAuth(async (req, ctx) => {
  const body = await req.json().catch(() => ({}));
  const parsed = lineItemInput.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const id = itemId(req);
  const editable = await parentIsEditable(ctx, id);
  if (editable === null) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!editable) return NextResponse.json({ error: "invoice_not_editable" }, { status: 409 });

  const row = await updateRow(ctx.supabase, "crm_invoice_items", ctx.orgId, id, parsed.data);
  return NextResponse.json({ data: row });
});

export const DELETE = withOrgAuth(async (req, ctx) => {
  const id = itemId(req);
  const editable = await parentIsEditable(ctx, id);
  if (editable === null) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!editable) return NextResponse.json({ error: "invoice_not_editable" }, { status: 409 });

  await deleteRow(ctx.supabase, "crm_invoice_items", ctx.orgId, id);
  return NextResponse.json({ ok: true });
});
