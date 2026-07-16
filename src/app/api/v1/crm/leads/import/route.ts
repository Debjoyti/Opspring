import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { csvToObjects } from "@/lib/csv";
import { importLeadsInput, leadInput } from "@/lib/services/crm/types";

const MAX_ROWS = 2000;

/**
 * CSV lead import. Expected headers (case-insensitive): name (required),
 * company, email, phone, title, source, status, tags (semicolon-separated).
 * Rows failing validation are skipped and reported; rows whose email already
 * exists on a lead in this org are skipped as duplicates.
 */
export const POST = withOrgAuth(async (req, ctx) => {
  const body = await req.json().catch(() => ({}));
  const parsed = importLeadsInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { headers, rows } = csvToObjects(parsed.data.csv);
  if (!headers.includes("name")) {
    return NextResponse.json({ error: "csv_missing_name_column" }, { status: 422 });
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: "csv_has_no_data_rows" }, { status: 422 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `csv_too_large_max_${MAX_ROWS}_rows` },
      { status: 422 },
    );
  }

  const { data: existing, error: existingError } = await ctx.supabase
    .from("crm_leads")
    .select("email")
    .eq("org_id", ctx.orgId)
    .not("email", "is", null);
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }
  const seenEmails = new Set(
    (existing ?? []).map((r) => String(r.email).trim().toLowerCase()).filter(Boolean),
  );

  const toInsert: Record<string, unknown>[] = [];
  const skipped: { line: number; reason: string }[] = [];

  rows.forEach((row, idx) => {
    const line = idx + 2; // 1-based, after the header row
    const candidate = {
      name: row.name ?? "",
      company: row.company ?? "",
      email: row.email ?? "",
      phone: row.phone ?? "",
      title: row.title ?? "",
      source: row.source ?? "",
      status: row.status || "new",
      tags: (row.tags ?? "")
        .split(";")
        .map((t) => t.trim())
        .filter(Boolean),
    };
    const result = leadInput.safeParse(candidate);
    if (!result.success) {
      const issue = result.error.issues[0];
      skipped.push({ line, reason: `${issue.path.join(".") || "row"}: ${issue.message}` });
      return;
    }
    const email = result.data.email?.toLowerCase();
    if (email) {
      if (seenEmails.has(email)) {
        skipped.push({ line, reason: "duplicate email" });
        return;
      }
      seenEmails.add(email);
    }
    toInsert.push({ ...result.data, org_id: ctx.orgId, owner_id: ctx.userId });
  });

  let imported = 0;
  for (let i = 0; i < toInsert.length; i += 500) {
    const chunk = toInsert.slice(i, i + 500);
    const { error } = await ctx.supabase.from("crm_leads").insert(chunk);
    if (error) {
      return NextResponse.json(
        { error: error.message, imported, skipped },
        { status: 500 },
      );
    }
    imported += chunk.length;
  }

  return NextResponse.json({ data: { imported, skipped } });
});
