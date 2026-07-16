import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { getRow, insertRow } from "@/lib/services/crm/repository";
import { PAYABLE_STATUSES } from "@/lib/services/crm/invoices";
import { paymentInput } from "@/lib/services/crm/types";

/** The [id] segment sits before the /payments suffix. */
function invoiceId(req: Request): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  return parts[parts.length - 2];
}

export const GET = withOrgAuth(async (req, ctx) => {
  const { data, error } = await ctx.supabase
    .from("crm_payments")
    .select("*")
    .eq("org_id", ctx.orgId)
    .eq("invoice_id", invoiceId(req))
    .order("paid_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
});

export const POST = withOrgAuth(async (req, ctx) => {
  const body = await req.json().catch(() => ({}));
  const parsed = paymentInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const id = invoiceId(req);
  const invoice = (await getRow(
    ctx.supabase,
    "crm_invoices",
    ctx.orgId,
    id,
    "id, status, paid_total",
  )) as { id: string; status: string; paid_total: number } | null;
  if (!invoice) return NextResponse.json({ error: "invoice_not_found" }, { status: 404 });
  if (!PAYABLE_STATUSES.includes(invoice.status)) {
    return NextResponse.json({ error: "invoice_not_payable" }, { status: 409 });
  }

  // Never record more than the amount still owed.
  const { data: total, error: totalError } = await ctx.supabase.rpc("crm_invoice_total", {
    p_invoice_id: id,
  });
  if (totalError) return NextResponse.json({ error: totalError.message }, { status: 500 });
  const remaining = Number(total ?? 0) - Number(invoice.paid_total ?? 0);
  if (parsed.data.amount > remaining + 0.005) {
    return NextResponse.json(
      { error: "amount_exceeds_remaining", remaining: Math.round(remaining * 100) / 100 },
      { status: 422 },
    );
  }

  const row = await insertRow(ctx.supabase, "crm_payments", ctx.orgId, {
    ...parsed.data,
    invoice_id: id,
    actor_id: ctx.userId,
  });
  return NextResponse.json({ data: row }, { status: 201 });
});
