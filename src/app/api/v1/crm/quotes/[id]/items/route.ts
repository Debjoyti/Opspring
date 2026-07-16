import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { getRow, insertRow } from "@/lib/services/crm/repository";
import { lineItemInput } from "@/lib/services/crm/types";

/** The [id] segment sits before the /items suffix. */
function quoteId(req: Request): string {
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

  const id = quoteId(req);
  const quote = await getRow(ctx.supabase, "crm_quotes", ctx.orgId, id, "id, status");
  if (!quote) return NextResponse.json({ error: "quote_not_found" }, { status: 404 });

  const row = await insertRow(ctx.supabase, "crm_quote_items", ctx.orgId, {
    ...parsed.data,
    quote_id: id,
  });
  return NextResponse.json({ data: row }, { status: 201 });
});
