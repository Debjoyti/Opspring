import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { deleteRow, getRow, updateRow } from "@/lib/services/crm/repository";
import { quotePatchInput } from "@/lib/services/crm/types";

const QUOTE_SELECT =
  "*, items:crm_quote_items(*), account:crm_accounts(id, name), contact:crm_contacts(id, first_name, last_name, email), deal:crm_deals(id, name)";

function itemId(req: Request): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  return parts[parts.length - 1];
}

export const GET = withOrgAuth(async (req, ctx) => {
  const row = await getRow(ctx.supabase, "crm_quotes", ctx.orgId, itemId(req), QUOTE_SELECT);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ data: row });
});

export const PATCH = withOrgAuth(async (req, ctx) => {
  const body = await req.json().catch(() => ({}));
  const parsed = quotePatchInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const row = await updateRow(ctx.supabase, "crm_quotes", ctx.orgId, itemId(req), parsed.data);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ data: row });
});

export const DELETE = withOrgAuth(async (req, ctx) => {
  await deleteRow(ctx.supabase, "crm_quotes", ctx.orgId, itemId(req));
  return NextResponse.json({ ok: true });
});
