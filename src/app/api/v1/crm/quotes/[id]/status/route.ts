import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { getRow, updateRow } from "@/lib/services/crm/repository";
import { QUOTE_STATUS_STAMP, QUOTE_TRANSITIONS } from "@/lib/services/crm/quotes";
import { quoteStatusInput } from "@/lib/services/crm/types";

/** The [id] segment sits before the /status suffix. */
function quoteId(req: Request): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  return parts[parts.length - 2];
}

export const POST = withOrgAuth(async (req, ctx) => {
  const body = await req.json().catch(() => ({}));
  const parsed = quoteStatusInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const id = quoteId(req);
  const quote = (await getRow(ctx.supabase, "crm_quotes", ctx.orgId, id, "id, status")) as
    | { id: string; status: string }
    | null;
  if (!quote) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const target = parsed.data.status;
  if (!(QUOTE_TRANSITIONS[quote.status] ?? []).includes(target)) {
    return NextResponse.json(
      { error: `invalid_transition_${quote.status}_to_${target}` },
      { status: 409 },
    );
  }

  const values: Record<string, unknown> = { status: target };
  const stamp = QUOTE_STATUS_STAMP[target];
  if (stamp) values[stamp] = new Date().toISOString();

  const row = await updateRow(ctx.supabase, "crm_quotes", ctx.orgId, id, values);
  return NextResponse.json({ data: row });
});
