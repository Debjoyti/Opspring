import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { getClinicOverview } from "@/lib/services/clinic/metrics";

export const GET = withOrgAuth(async (_req, ctx) => {
  const overview = await getClinicOverview(ctx.supabase, ctx.orgId);
  return NextResponse.json({ data: overview });
});
