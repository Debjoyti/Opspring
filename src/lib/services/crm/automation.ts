import type { SupabaseClient } from "@supabase/supabase-js";
import { planRoundRobin } from "./assignment";
import type { AutomationAction, AutomationEvent } from "./types";

export type AutomationRule = {
  id: string;
  name: string;
  enabled: boolean;
  trigger_event: AutomationEvent;
  condition_stage_id: string | null;
  actions: AutomationAction[];
};

export type AutomationPayload = {
  entityType: "lead" | "deal" | "quote" | "invoice";
  entityId: string;
  /** Target stage for deal_stage_changed events. */
  stageId?: string;
};

type ActionResult = { type: string; ok: boolean; detail: string };

/** Pure: does this rule fire for the event/payload? */
export function ruleMatches(
  rule: Pick<AutomationRule, "enabled" | "trigger_event" | "condition_stage_id">,
  event: AutomationEvent,
  payload: AutomationPayload,
): boolean {
  if (!rule.enabled || rule.trigger_event !== event) return false;
  if (event === "deal_stage_changed" && rule.condition_stage_id) {
    return rule.condition_stage_id === payload.stageId;
  }
  return true;
}

/** Pure: which actions make sense for which events. */
const ACTION_EVENTS: Record<AutomationAction["type"], AutomationEvent[]> = {
  assign_round_robin: ["lead_created"],
  create_task: [
    "lead_created",
    "deal_created",
    "deal_stage_changed",
    "quote_accepted",
    "invoice_paid",
  ],
  add_tags: ["lead_created", "deal_created", "deal_stage_changed"],
};

export function actionApplicable(
  actionType: AutomationAction["type"],
  event: AutomationEvent,
): boolean {
  return ACTION_EVENTS[actionType].includes(event);
}

const TAGGABLE_TABLES: Record<string, string> = {
  lead: "crm_leads",
  deal: "crm_deals",
};

/**
 * Where a created task should attach. Quotes/invoices aren't valid activity
 * relations, so their events fall back to the linked deal, then account.
 */
async function resolveTaskRelation(
  supabase: SupabaseClient,
  orgId: string,
  payload: AutomationPayload,
): Promise<{ related_type: string; related_id: string } | null> {
  if (payload.entityType === "lead" || payload.entityType === "deal") {
    return { related_type: payload.entityType, related_id: payload.entityId };
  }
  const table = payload.entityType === "quote" ? "crm_quotes" : "crm_invoices";
  const { data } = await supabase
    .from(table)
    .select("deal_id, account_id")
    .eq("org_id", orgId)
    .eq("id", payload.entityId)
    .maybeSingle();
  if (data?.deal_id) return { related_type: "deal", related_id: data.deal_id as string };
  if (data?.account_id) return { related_type: "account", related_id: data.account_id as string };
  return null;
}

async function executeAction(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  event: AutomationEvent,
  action: AutomationAction,
  payload: AutomationPayload,
): Promise<ActionResult> {
  if (!actionApplicable(action.type, event)) {
    return { type: action.type, ok: false, detail: `not applicable to ${event}` };
  }

  if (action.type === "assign_round_robin") {
    const { data: members, error } = await supabase
      .from("memberships")
      .select("user_id")
      .eq("org_id", orgId)
      .eq("status", "active")
      .in("role", ["owner", "admin", "manager", "member"]);
    if (error) return { type: action.type, ok: false, detail: error.message };
    if (!members || members.length === 0) {
      return { type: action.type, ok: false, detail: "no assignable members" };
    }
    const { data: owned } = await supabase
      .from("crm_leads")
      .select("owner_id")
      .eq("org_id", orgId)
      .neq("status", "converted")
      .not("owner_id", "is", null);
    const counts = new Map<string, number>();
    for (const m of members) counts.set(m.user_id as string, 0);
    for (const row of owned ?? []) {
      const owner = row.owner_id as string;
      if (counts.has(owner)) counts.set(owner, (counts.get(owner) ?? 0) + 1);
    }
    const [assignment] = planRoundRobin(
      [payload.entityId],
      [...counts.entries()].map(([uid, openCount]) => ({ userId: uid, openCount })),
    );
    const { error: updateError } = await supabase
      .from("crm_leads")
      .update({ owner_id: assignment.userId })
      .eq("org_id", orgId)
      .eq("id", payload.entityId);
    if (updateError) return { type: action.type, ok: false, detail: updateError.message };
    return { type: action.type, ok: true, detail: `assigned to ${assignment.userId}` };
  }

  if (action.type === "create_task") {
    const relation = await resolveTaskRelation(supabase, orgId, payload);
    const dueAt = new Date(Date.now() + action.due_in_days * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from("crm_activities").insert({
      org_id: orgId,
      type: "task",
      subject: action.subject,
      due_at: dueAt,
      done: false,
      actor_id: userId,
      ...(relation ?? {}),
    });
    if (error) return { type: action.type, ok: false, detail: error.message };
    return { type: action.type, ok: true, detail: `task due ${dueAt.slice(0, 10)}` };
  }

  // add_tags
  const table = TAGGABLE_TABLES[payload.entityType];
  if (!table) return { type: action.type, ok: false, detail: "entity has no tags" };
  const { data: row, error: fetchError } = await supabase
    .from(table)
    .select("tags")
    .eq("org_id", orgId)
    .eq("id", payload.entityId)
    .maybeSingle();
  if (fetchError || !row) {
    return { type: action.type, ok: false, detail: fetchError?.message ?? "entity not found" };
  }
  const merged = [...new Set([...((row.tags as string[]) ?? []), ...action.tags])];
  const { error: tagError } = await supabase
    .from(table)
    .update({ tags: merged })
    .eq("org_id", orgId)
    .eq("id", payload.entityId);
  if (tagError) return { type: action.type, ok: false, detail: tagError.message };
  return { type: action.type, ok: true, detail: `tags: ${merged.join(", ")}` };
}

/**
 * Runs every matching enabled rule for an event, in position order, through
 * the caller's RLS-scoped client, and logs each rule execution. Never throws:
 * an automation failure must not fail the request that triggered it.
 */
export async function runAutomations(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  event: AutomationEvent,
  payload: AutomationPayload,
): Promise<void> {
  try {
    const { data: rules, error } = await supabase
      .from("crm_automation_rules")
      .select("id, name, enabled, trigger_event, condition_stage_id, actions")
      .eq("org_id", orgId)
      .eq("trigger_event", event)
      .eq("enabled", true)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error || !rules || rules.length === 0) return;

    for (const rule of rules as AutomationRule[]) {
      if (!ruleMatches(rule, event, payload)) continue;
      const results: ActionResult[] = [];
      for (const action of rule.actions) {
        try {
          results.push(await executeAction(supabase, orgId, userId, event, action, payload));
        } catch (err) {
          results.push({
            type: action.type,
            ok: false,
            detail: err instanceof Error ? err.message : "action failed",
          });
        }
      }
      await supabase.from("crm_automation_runs").insert({
        org_id: orgId,
        rule_id: rule.id,
        rule_name: rule.name,
        trigger_event: event,
        entity_type: payload.entityType,
        entity_id: payload.entityId,
        results,
      });
    }
  } catch (err) {
    console.error("[automations] run failed:", err);
  }
}
