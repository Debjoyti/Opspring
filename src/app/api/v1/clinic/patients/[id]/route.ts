import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";

function patientId(req: Request): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  return parts[parts.length - 1];
}

export const GET = withOrgAuth(async (req, ctx) => {
  const id = patientId(req);
  const { data: patient, error } = await ctx.supabase
    .from("clinic_patients")
    .select("*")
    .eq("org_id", ctx.orgId)
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!patient) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [appointments, treatments, payments, notes] = await Promise.all([
    ctx.supabase.from("clinic_appointments").select("id, appointment_at, doctor, status").eq("org_id", ctx.orgId).eq("patient_id", id).order("appointment_at", { ascending: false }).limit(50),
    ctx.supabase.from("clinic_treatments").select("id, treatment_name, amount, doctor, treated_on").eq("org_id", ctx.orgId).eq("patient_id", id).order("treated_on", { ascending: false }).limit(50),
    ctx.supabase.from("clinic_payments").select("id, treatment_name, amount_paid, payment_mode, paid_on").eq("org_id", ctx.orgId).eq("patient_id", id).order("paid_on", { ascending: false }).limit(50),
    ctx.supabase.from("clinic_clinical_notes").select("id, type, description, doctor, noted_on").eq("org_id", ctx.orgId).eq("patient_id", id).order("noted_on", { ascending: false }).limit(50),
  ]);

  return NextResponse.json({
    data: {
      patient,
      appointments: appointments.data ?? [],
      treatments: treatments.data ?? [],
      payments: payments.data ?? [],
      notes: notes.data ?? [],
    },
  });
});
