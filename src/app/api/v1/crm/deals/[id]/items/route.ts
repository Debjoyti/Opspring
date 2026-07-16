import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { getRow, insertRow } from "@/lib/services/crm/repository";
import { lineItemInput } from "@/lib/services/crm/types";

/** The [id] segment sits before the /items suffix. */
function dealId(req: Request): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  return parts[parts.length - 2];
}

export const GET = withOrgAuth(async (req, ctx) => {
  const { data, error } = await ctx.supabase
    .from("crm_deal_items")
    .select("*, product:crm_products(id, name, sku)")
    .eq("org_id", ctx.orgId)
    .eq("deal_id", dealId(req))
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
});

export const POST = withOrgAuth(async (req, ctx) => {
  const body = await req.json().catch(() => ({}));
  const parsed = lineItemInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const id = dealId(req);
  const deal = await getRow(ctx.supabase, "crm_deals", ctx.orgId, id, "id");
  if (!deal) return NextResponse.json({ error: "deal_not_found" }, { status: 404 });

  const row = await insertRow(ctx.supabase, "crm_deal_items", ctx.orgId, {
    ...parsed.data,
    deal_id: id,
  });
  return NextResponse.json({ data: row }, { status: 201 });
});
