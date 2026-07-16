import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { listRows } from "@/lib/services/crm/repository";

export const GET = withOrgAuth(async (_req, ctx) => {
  const rows = await listRows(ctx.supabase, "crm_automation_runs", ctx.orgId, {
    limit: 30,
  });
  return NextResponse.json({ data: rows });
});
