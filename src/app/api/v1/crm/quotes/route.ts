import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { listRows } from "@/lib/services/crm/repository";
import { quoteInput } from "@/lib/services/crm/types";

const QUOTE_LIST_SELECT =
  "*, items:crm_quote_items(*), account:crm_accounts(id, name), contact:crm_contacts(id, first_name, last_name), deal:crm_deals(id, name)";

export const GET = withOrgAuth(async (_req, ctx) => {
  const rows = await listRows(ctx.supabase, "crm_quotes", ctx.orgId, {
    select: QUOTE_LIST_SELECT,
  });
  return NextResponse.json({ data: rows });
});

export const POST = withOrgAuth(async (req, ctx) => {
  const body = await req.json().catch(() => ({}));
  const parsed = quoteInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const { items, ...quoteFields } = parsed.data;
  const values: Record<string, unknown> = { ...quoteFields };
  let lineItems = items ?? [];

  // Creating from a deal inherits its account/contact/currency and — when no
  // items were passed — copies the deal's line items onto the quote.
  if (parsed.data.deal_id) {
    const { data: deal, error } = await ctx.supabase
      .from("crm_deals")
      .select("id, account_id, contact_id, currency, items:crm_deal_items(product_id, description, quantity, unit_price, discount_pct, position)")
      .eq("org_id", ctx.orgId)
      .eq("id", parsed.data.deal_id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!deal) return NextResponse.json({ error: "deal_not_found" }, { status: 422 });
    values.account_id = values.account_id ?? deal.account_id ?? undefined;
    values.contact_id = values.contact_id ?? deal.contact_id ?? undefined;
    if (!body.currency) values.currency = deal.currency;
    if (lineItems.length === 0) lineItems = deal.items ?? [];
  }

  const { data: quote, error: quoteError } = await ctx.supabase
    .from("crm_quotes")
    .insert({ ...values, org_id: ctx.orgId, owner_id: ctx.userId })
    .select("*")
    .single();
  if (quoteError) return NextResponse.json({ error: quoteError.message }, { status: 500 });

  let insertedItems: unknown[] = [];
  if (lineItems.length > 0) {
    const { data, error } = await ctx.supabase
      .from("crm_quote_items")
      .insert(
        lineItems.map((item, idx) => ({
          ...item,
          position: item.position ?? idx,
          org_id: ctx.orgId,
          quote_id: quote.id,
        })),
      )
      .select("*");
    if (error) {
      // Never leave a half-created quote behind.
      await ctx.supabase.from("crm_quotes").delete().eq("org_id", ctx.orgId).eq("id", quote.id);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    insertedItems = data ?? [];
  }

  return NextResponse.json({ data: { ...quote, items: insertedItems } }, { status: 201 });
});
