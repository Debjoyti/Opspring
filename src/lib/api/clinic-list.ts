import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";

type ClinicTable =
  | "clinic_patients"
  | "clinic_appointments"
  | "clinic_treatments"
  | "clinic_payments"
  | "clinic_invoices"
  | "clinic_procedures"
  | "clinic_clinical_notes";

/**
 * Read-only list handler for a clinic table. Supports ?q= (ILIKE across the
 * given searchColumns), ?limit / ?offset (capped), and a default ordering.
 * Guarded by withOrgAuth; RLS scopes rows to the caller's org underneath.
 */
export function clinicList(config: {
  table: ClinicTable;
  select?: string;
  searchColumns?: string[];
  order?: string;
  ascending?: boolean;
  defaultLimit?: number;
}) {
  return withOrgAuth(async (req, ctx) => {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim();
    const limit = Math.min(Number(url.searchParams.get("limit")) || config.defaultLimit || 50, 200);
    const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

    let query = ctx.supabase
      .from(config.table)
      .select(config.select ?? "*", { count: "exact" })
      .eq("org_id", ctx.orgId);

    if (q && config.searchColumns?.length) {
      const or = config.searchColumns.map((c) => `${c}.ilike.%${q}%`).join(",");
      query = query.or(or);
    }

    query = query
      .order(config.order ?? "created_at", { ascending: config.ascending ?? false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [], total: count ?? 0 });
  });
}
