import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { toCsv, type CsvValue } from "@/lib/csv";
import { listRows, type CrmTable } from "@/lib/services/crm/repository";

type ExportConfig = { table: CrmTable; columns: string[] };

const EXPORTS: Record<string, ExportConfig> = {
  leads: {
    table: "crm_leads",
    columns: [
      "name", "company", "email", "phone", "title", "source", "status",
      "score", "score_reason", "tags", "created_at",
    ],
  },
  contacts: {
    table: "crm_contacts",
    columns: ["first_name", "last_name", "email", "phone", "title", "tags", "created_at"],
  },
  accounts: {
    table: "crm_accounts",
    columns: ["name", "industry", "website", "phone", "tags", "created_at"],
  },
  deals: {
    table: "crm_deals",
    columns: [
      "name", "amount", "currency", "close_date", "closed_at", "lost_reason",
      "tags", "created_at",
    ],
  },
};

export const GET = withOrgAuth(async (req, ctx) => {
  const resource = new URL(req.url).searchParams.get("resource") ?? "";
  const config = EXPORTS[resource];
  if (!config) return NextResponse.json({ error: "invalid_resource" }, { status: 422 });

  const rows = (await listRows(ctx.supabase, config.table, ctx.orgId, {
    select: config.columns.join(", "),
  })) as unknown as Record<string, unknown>[];

  const csv = toCsv(
    config.columns,
    rows.map((row) =>
      config.columns.map((column): CsvValue => {
        const value = row[column];
        if (Array.isArray(value)) return value.join(";");
        return value as CsvValue;
      }),
    ),
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${resource}.csv"`,
    },
  });
});
