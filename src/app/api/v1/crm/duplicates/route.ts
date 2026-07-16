import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { findDuplicateGroups, type DedupeRow } from "@/lib/services/crm/dedupe";

/**
 * Duplicate detection for leads / contacts / accounts. Returns groups of
 * records sharing an email, phone, or exact name, with enough of each row to
 * render a merge dialog.
 */
export const GET = withOrgAuth(async (req, ctx) => {
  const resource = new URL(req.url).searchParams.get("resource") ?? "leads";

  let rows: (DedupeRow & Record<string, unknown>)[] = [];
  if (resource === "leads") {
    const { data, error } = await ctx.supabase
      .from("crm_leads")
      .select("id, name, company, email, phone, status")
      .eq("org_id", ctx.orgId)
      .neq("status", "converted");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows = (data ?? []) as typeof rows;
  } else if (resource === "contacts") {
    const { data, error } = await ctx.supabase
      .from("crm_contacts")
      .select("id, first_name, last_name, email, phone")
      .eq("org_id", ctx.orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows = (data ?? []).map((r) => ({
      ...r,
      id: r.id as string,
      name: [r.first_name, r.last_name].filter(Boolean).join(" "),
    }));
  } else if (resource === "accounts") {
    const { data, error } = await ctx.supabase
      .from("crm_accounts")
      .select("id, name, phone, website")
      .eq("org_id", ctx.orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows = (data ?? []).map((r) => ({ ...r, id: r.id as string, name: r.name as string, email: null }));
  } else {
    return NextResponse.json({ error: "invalid_resource" }, { status: 422 });
  }

  const byId = new Map(rows.map((r) => [r.id, r]));
  const groups = findDuplicateGroups(rows).map((group) => ({
    ...group,
    records: group.ids.map((id) => byId.get(id)),
  }));

  return NextResponse.json({ data: groups });
});
