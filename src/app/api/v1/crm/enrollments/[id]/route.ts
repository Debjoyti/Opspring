import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { unenroll } from "@/lib/services/crm/cadences";

function itemId(req: Request): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  return parts[parts.length - 1];
}

export const DELETE = withOrgAuth(async (req, ctx) => {
  const result = await unenroll(ctx.supabase, ctx.orgId, itemId(req));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true });
});
