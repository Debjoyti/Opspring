import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";

/**
 * Appointments within a date range, for the calendar. Requires ?from= and
 * ?to= (ISO dates); refuses ranges over 60 days so a bad caller can't pull
 * the whole 13k-row history in one request. RLS scopes rows to the org.
 */
export const GET = withOrgAuth(async (req, ctx) => {
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ error: "missing from/to" }, { status: 400 });
  }
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return NextResponse.json({ error: "invalid from/to" }, { status: 400 });
  }
  const rangeDays = (toDate.getTime() - fromDate.getTime()) / 86_400_000;
  if (rangeDays <= 0 || rangeDays > 60) {
    return NextResponse.json({ error: "range must be 1-60 days" }, { status: 400 });
  }

  const { data, error } = await ctx.supabase
    .from("clinic_appointments")
    .select("id, patient_id, patient_name, patient_number, appointment_at, doctor, status, notes, checked_in_at, checked_out_at")
    .eq("org_id", ctx.orgId)
    .gte("appointment_at", fromDate.toISOString())
    .lt("appointment_at", toDate.toISOString())
    .order("appointment_at", { ascending: true })
    .limit(2000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
});
