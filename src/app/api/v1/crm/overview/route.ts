import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { getCrmOverview } from "@/lib/services/crm/metrics";

export const GET = withOrgAuth(async (_req, ctx) => {
  const overview = await getCrmOverview(ctx.supabase, ctx.orgId);
  return NextResponse.json({ data: overview });
});
