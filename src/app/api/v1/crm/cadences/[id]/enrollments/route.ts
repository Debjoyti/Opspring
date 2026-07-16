import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";

/** The [id] segment sits before the /enrollments suffix. */
function cadenceId(req: Request): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  return parts[parts.length - 2];
}

export const GET = withOrgAuth(async (req, ctx) => {
  const { data: enrollments, error } = await ctx.supabase
    .from("crm_cadence_enrollments")
    .select("id, entity_type, entity_id, created_at")
    .eq("org_id", ctx.orgId)
    .eq("cadence_id", cadenceId(req))
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Resolve display names in two batch lookups.
  const leadIds = (enrollments ?? []).filter((e) => e.entity_type === "lead").map((e) => e.entity_id);
  const contactIds = (enrollments ?? [])
    .filter((e) => e.entity_type === "contact")
    .map((e) => e.entity_id);
  const [leads, contacts] = await Promise.all([
    leadIds.length > 0
      ? ctx.supabase.from("crm_leads").select("id, name").eq("org_id", ctx.orgId).in("id", leadIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    contactIds.length > 0
      ? ctx.supabase
          .from("crm_contacts")
          .select("id, first_name, last_name")
          .eq("org_id", ctx.orgId)
          .in("id", contactIds)
      : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string | null }[] }),
  ]);
  const names = new Map<string, string>();
  for (const l of leads.data ?? []) names.set(l.id as string, l.name as string);
  for (const c of contacts.data ?? []) {
    names.set(
      c.id as string,
      [c.first_name, (c as { last_name?: string | null }).last_name].filter(Boolean).join(" "),
    );
  }

  return NextResponse.json({
    data: (enrollments ?? []).map((e) => ({
      ...e,
      entity_name: names.get(e.entity_id as string) ?? "(deleted)",
    })),
  });
});
