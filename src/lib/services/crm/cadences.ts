import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivityType } from "./types";

export type CadenceStep = {
  position: number;
  day_offset: number;
  activity_type: ActivityType;
  subject: string;
};

export type PlannedTask = {
  type: ActivityType;
  subject: string;
  due_at: string;
  done: false;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pure: turns cadence steps into the activity rows an enrollment creates.
 * Steps are materialized up front with staggered due dates — that's what
 * makes cadences work without any background scheduler.
 */
export function planEnrollmentTasks(steps: CadenceStep[], enrolledAt: Date): PlannedTask[] {
  return [...steps]
    .sort((a, b) => a.position - b.position || a.day_offset - b.day_offset)
    .map((step) => ({
      type: step.activity_type,
      subject: step.subject,
      due_at: new Date(enrolledAt.getTime() + step.day_offset * DAY_MS).toISOString(),
      done: false,
    }));
}

export type EnrollResult =
  | { ok: true; enrollmentId: string; tasksCreated: number }
  | { ok: false; error: "cadence_not_found" | "cadence_inactive" | "already_enrolled" | "entity_not_found" | string };

/**
 * Enrolls a lead/contact into a cadence: one enrollment row plus one activity
 * per step, all through the caller's RLS-scoped client.
 */
export async function enrollInCadence(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  cadenceId: string,
  entity: { entity_type: "lead" | "contact"; entity_id: string },
): Promise<EnrollResult> {
  const { data: cadence, error: cadenceError } = await supabase
    .from("crm_cadences")
    .select("id, active, steps:crm_cadence_steps(position, day_offset, activity_type, subject)")
    .eq("org_id", orgId)
    .eq("id", cadenceId)
    .maybeSingle();
  if (cadenceError) return { ok: false, error: cadenceError.message };
  if (!cadence) return { ok: false, error: "cadence_not_found" };
  if (!cadence.active) return { ok: false, error: "cadence_inactive" };

  const table = entity.entity_type === "lead" ? "crm_leads" : "crm_contacts";
  const { data: record } = await supabase
    .from(table)
    .select("id")
    .eq("org_id", orgId)
    .eq("id", entity.entity_id)
    .maybeSingle();
  if (!record) return { ok: false, error: "entity_not_found" };

  const { data: enrollment, error: enrollError } = await supabase
    .from("crm_cadence_enrollments")
    .insert({
      org_id: orgId,
      cadence_id: cadenceId,
      entity_type: entity.entity_type,
      entity_id: entity.entity_id,
      enrolled_by: userId,
    })
    .select("id")
    .single();
  if (enrollError) {
    if (enrollError.code === "23505") return { ok: false, error: "already_enrolled" };
    return { ok: false, error: enrollError.message };
  }

  const tasks = planEnrollmentTasks((cadence.steps ?? []) as CadenceStep[], new Date());
  if (tasks.length > 0) {
    const { error: taskError } = await supabase.from("crm_activities").insert(
      tasks.map((task) => ({
        ...task,
        org_id: orgId,
        related_type: entity.entity_type,
        related_id: entity.entity_id,
        enrollment_id: enrollment.id,
        actor_id: userId,
      })),
    );
    if (taskError) {
      // Never leave a half-materialized enrollment behind.
      await supabase
        .from("crm_cadence_enrollments")
        .delete()
        .eq("org_id", orgId)
        .eq("id", enrollment.id);
      return { ok: false, error: taskError.message };
    }
  }

  return { ok: true, enrollmentId: enrollment.id as string, tasksCreated: tasks.length };
}

/**
 * Unenroll: remove the still-open generated activities (completed ones stay
 * as history), then the enrollment itself.
 */
export async function unenroll(
  supabase: SupabaseClient,
  orgId: string,
  enrollmentId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error: taskError } = await supabase
    .from("crm_activities")
    .delete()
    .eq("org_id", orgId)
    .eq("enrollment_id", enrollmentId)
    .eq("done", false);
  if (taskError) return { ok: false, error: taskError.message };

  const { error } = await supabase
    .from("crm_cadence_enrollments")
    .delete()
    .eq("org_id", orgId)
    .eq("id", enrollmentId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
