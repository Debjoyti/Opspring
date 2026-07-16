import { NextResponse } from "next/server";
import type { z } from "zod";
import { withOrgAuth } from "@/lib/api/handler";
import {
  deleteRow,
  getRow,
  insertRow,
  listRows,
  updateRow,
  type CrmTable,
} from "@/lib/services/crm/repository";

/**
 * Builds the standard collection (GET list / POST create) and item
 * (GET / PATCH / DELETE) handlers for a CRM table. Keeps every entity's
 * route consistent, guarded by withOrgAuth, and Zod-validated. `ownerField`,
 * when set, stamps the creating user onto new rows.
 */
export function crudCollection<Schema extends z.ZodObject<z.ZodRawShape>>(config: {
  table: CrmTable;
  schema: Schema;
  select?: string;
  order?: string;
  ownerField?: string;
}) {
  const GET = withOrgAuth(async (_req, ctx) => {
    const rows = await listRows(ctx.supabase, config.table, ctx.orgId, {
      select: config.select,
      order: config.order,
    });
    return NextResponse.json({ data: rows });
  });

  const POST = withOrgAuth(async (req, ctx) => {
    const body = await req.json().catch(() => ({}));
    const parsed = config.schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_error", issues: parsed.error.flatten() },
        { status: 422 },
      );
    }
    const values: Record<string, unknown> = { ...(parsed.data as Record<string, unknown>) };
    if (config.ownerField) values[config.ownerField] = ctx.userId;
    const row = await insertRow(ctx.supabase, config.table, ctx.orgId, values);
    return NextResponse.json({ data: row }, { status: 201 });
  });

  return { GET, POST };
}

export function crudItem<Schema extends z.ZodObject<z.ZodRawShape>>(config: {
  table: CrmTable;
  schema: Schema;
  select?: string;
}) {
  const GET = withOrgAuth(async (req, ctx) => {
    const id = itemId(req);
    const row = await getRow(ctx.supabase, config.table, ctx.orgId, id, config.select);
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ data: row });
  });

  const PATCH = withOrgAuth(async (req, ctx) => {
    const id = itemId(req);
    const body = await req.json().catch(() => ({}));
    const parsed = config.schema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_error", issues: parsed.error.flatten() },
        { status: 422 },
      );
    }
    const row = await updateRow(
      ctx.supabase,
      config.table,
      ctx.orgId,
      id,
      parsed.data as Record<string, unknown>,
    );
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ data: row });
  });

  const DELETE = withOrgAuth(async (req, ctx) => {
    const id = itemId(req);
    await deleteRow(ctx.supabase, config.table, ctx.orgId, id);
    return NextResponse.json({ ok: true });
  });

  return { GET, PATCH, DELETE };
}

/** The [id] segment is the last path part; avoids relying on the ctx params shape. */
function itemId(req: Request): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  return parts[parts.length - 1];
}
