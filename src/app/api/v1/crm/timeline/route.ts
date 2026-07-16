import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";
import { ENTITY_TYPES } from "@/lib/services/crm/types";

export type TimelineEvent = {
  id: string;
  kind: "activity" | "note";
  type: string;
  subject: string;
  body: string | null;
  done: boolean | null;
  due_at: string | null;
  created_at: string;
};

/** Merged activity + note timeline for one record, newest first. */
export const GET = withOrgAuth(async (req, ctx) => {
  const url = new URL(req.url);
  const entityType = url.searchParams.get("entity_type") ?? "";
  const entityId = url.searchParams.get("entity_id") ?? "";
  if (!(ENTITY_TYPES as readonly string[]).includes(entityType) || !entityId) {
    return NextResponse.json({ error: "invalid_entity" }, { status: 422 });
  }

  const [activities, notes] = await Promise.all([
    ctx.supabase
      .from("crm_activities")
      .select("id, type, subject, notes, done, due_at, created_at")
      .eq("org_id", ctx.orgId)
      .eq("related_type", entityType)
      .eq("related_id", entityId)
      .order("created_at", { ascending: false })
      .limit(100),
    ctx.supabase
      .from("crm_notes")
      .select("id, body, created_at")
      .eq("org_id", ctx.orgId)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (activities.error) return NextResponse.json({ error: activities.error.message }, { status: 500 });
  if (notes.error) return NextResponse.json({ error: notes.error.message }, { status: 500 });

  const events: TimelineEvent[] = [
    ...(activities.data ?? []).map((a) => ({
      id: a.id as string,
      kind: "activity" as const,
      type: a.type as string,
      subject: a.subject as string,
      body: (a.notes as string | null) ?? null,
      done: a.done as boolean,
      due_at: (a.due_at as string | null) ?? null,
      created_at: a.created_at as string,
    })),
    ...(notes.data ?? []).map((n) => ({
      id: n.id as string,
      kind: "note" as const,
      type: "note",
      subject: "Note",
      body: n.body as string,
      done: null,
      due_at: null,
      created_at: n.created_at as string,
    })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return NextResponse.json({ data: events });
});
