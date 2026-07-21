import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { getClinicAnalytics } from "@/lib/services/clinic/analytics";
import { generateNarrative } from "@/lib/services/clinic/ai-narrative";

export const maxDuration = 30;

export const GET = withOrgAuth(async (req, ctx) => {
  const analytics = await getClinicAnalytics(ctx.supabase, ctx.orgId);

  // Best-effort org name for the narrative; analytics don't depend on it.
  let orgName = "this clinic";
  const { data: org } = await ctx.supabase
    .from("organizations")
    .select("name")
    .eq("id", ctx.orgId)
    .maybeSingle();
  if (org?.name) orgName = org.name;

  const wantNarrative = new URL(req.url).searchParams.get("narrative") !== "0";
  const narrative = wantNarrative
    ? await generateNarrative(orgName, analytics)
    : { available: false, text: null };

  return NextResponse.json({ data: { ...analytics, narrative } });
});
