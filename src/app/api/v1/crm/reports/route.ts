import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { getCrmReports } from "@/lib/services/crm/reports";

export const GET = withOrgAuth(async (_req, ctx) => {
  const reports = await getCrmReports(ctx.supabase, ctx.orgId);
  return NextResponse.json({ data: reports });
});
