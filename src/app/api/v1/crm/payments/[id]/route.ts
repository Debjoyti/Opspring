import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { deleteRow } from "@/lib/services/crm/repository";

function itemId(req: Request): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  return parts[parts.length - 1];
}

/** Removing a mis-entered payment; the DB trigger re-derives invoice status. */
export const DELETE = withOrgAuth(async (req, ctx) => {
  await deleteRow(ctx.supabase, "crm_payments", ctx.orgId, itemId(req));
  return NextResponse.json({ ok: true });
});
