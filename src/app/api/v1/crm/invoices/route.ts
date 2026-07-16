import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { listRows } from "@/lib/services/crm/repository";
import { invoiceInput } from "@/lib/services/crm/types";

const INVOICE_LIST_SELECT =
  "*, items:crm_invoice_items(*), payments:crm_payments(*), account:crm_accounts(id, name), contact:crm_contacts(id, first_name, last_name), deal:crm_deals(id, name), quote:crm_quotes(id, number, title)";

export const GET = withOrgAuth(async (_req, ctx) => {
  const rows = await listRows(ctx.supabase, "crm_invoices", ctx.orgId, {
    select: INVOICE_LIST_SELECT,
  });
  return NextResponse.json({ data: rows });
});

export const POST = withOrgAuth(async (req, ctx) => {
  const body = await req.json().catch(() => ({}));
  const parsed = invoiceInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const { items, ...invoiceFields } = parsed.data;
  const values: Record<string, unknown> = { ...invoiceFields };
  let lineItems = items ?? [];

  // Creating from a quote inherits its parties, pricing knobs, and items.
  if (parsed.data.quote_id) {
    const { data: quote, error } = await ctx.supabase
      .from("crm_quotes")
      .select(
        "id, deal_id, account_id, contact_id, currency, discount_pct, tax_rate, notes, terms, items:crm_quote_items(product_id, description, quantity, unit_price, discount_pct, position)",
      )
      .eq("org_id", ctx.orgId)
      .eq("id", parsed.data.quote_id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!quote) return NextResponse.json({ error: "quote_not_found" }, { status: 422 });
    values.deal_id = values.deal_id ?? quote.deal_id ?? undefined;
    values.account_id = values.account_id ?? quote.account_id ?? undefined;
    values.contact_id = values.contact_id ?? quote.contact_id ?? undefined;
    if (!body.currency) values.currency = quote.currency;
    if (body.discount_pct === undefined) values.discount_pct = quote.discount_pct;
    if (body.tax_rate === undefined) values.tax_rate = quote.tax_rate;
    if (!body.notes) values.notes = quote.notes ?? undefined;
    if (!body.terms) values.terms = quote.terms ?? undefined;
    if (lineItems.length === 0) lineItems = quote.items ?? [];
  }

  const { data: invoice, error: invoiceError } = await ctx.supabase
    .from("crm_invoices")
    .insert({ ...values, org_id: ctx.orgId, owner_id: ctx.userId })
    .select("*")
    .single();
  if (invoiceError) return NextResponse.json({ error: invoiceError.message }, { status: 500 });

  let insertedItems: unknown[] = [];
  if (lineItems.length > 0) {
    const { data, error } = await ctx.supabase
      .from("crm_invoice_items")
      .insert(
        lineItems.map((item, idx) => ({
          ...item,
          position: item.position ?? idx,
          org_id: ctx.orgId,
          invoice_id: invoice.id,
        })),
      )
      .select("*");
    if (error) {
      await ctx.supabase
        .from("crm_invoices")
        .delete()
        .eq("org_id", ctx.orgId)
        .eq("id", invoice.id);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    insertedItems = data ?? [];
  }

  return NextResponse.json({ data: { ...invoice, items: insertedItems } }, { status: 201 });
});
