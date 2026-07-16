import type { SupabaseClient } from "@supabase/supabase-js";
import type { StageKind } from "./types";

/** Shared select for deal reads: stage + pipeline + account/contact names. */
export const DEAL_SELECT =
  "*, stage:crm_pipeline_stages(id, name, kind, probability, position), pipeline:crm_pipelines(id, name), account:crm_accounts(id, name), contact:crm_contacts(id, first_name, last_name)";

export type StageRow = {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
  probability: number;
  kind: StageKind;
};

/**
 * Resolves the pipeline/stage a new deal lands in. An explicit stage wins (and
 * fixes the pipeline to the stage's own); an explicit pipeline gets its first
 * open stage; otherwise the org's default pipeline's first open stage.
 */
export async function resolveStageDefaults(
  supabase: SupabaseClient,
  orgId: string,
  input: { pipeline_id?: string; stage_id?: string },
): Promise<{ pipeline_id: string; stage_id: string }> {
  if (input.stage_id) {
    const { data: stage, error } = await supabase
      .from("crm_pipeline_stages")
      .select("id, pipeline_id")
      .eq("org_id", orgId)
      .eq("id", input.stage_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!stage) throw new Error("stage_not_found");
    return { pipeline_id: stage.pipeline_id, stage_id: stage.id };
  }

  let pipelineId = input.pipeline_id;
  if (!pipelineId) {
    const { data: pipeline, error } = await supabase
      .from("crm_pipelines")
      .select("id")
      .eq("org_id", orgId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!pipeline) throw new Error("no_pipeline");
    pipelineId = pipeline.id;
  }

  const { data: stage, error: stageError } = await supabase
    .from("crm_pipeline_stages")
    .select("id")
    .eq("org_id", orgId)
    .eq("pipeline_id", pipelineId)
    .eq("kind", "open")
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (stageError) throw new Error(stageError.message);
  if (!stage) throw new Error("no_open_stage");
  return { pipeline_id: pipelineId!, stage_id: stage.id };
}

/**
 * Side effects of landing in a stage: closing stages stamp closed_at, and a
 * move back to an open stage clears the close state. lost_reason only makes
 * sense on a lost stage.
 */
export function stageSideEffects(kind: StageKind): Record<string, unknown> {
  if (kind === "open") return { closed_at: null, lost_reason: null };
  const effects: Record<string, unknown> = { closed_at: new Date().toISOString() };
  if (kind === "won") effects.lost_reason = null;
  return effects;
}

export async function getStage(
  supabase: SupabaseClient,
  orgId: string,
  stageId: string,
): Promise<StageRow | null> {
  const { data, error } = await supabase
    .from("crm_pipeline_stages")
    .select("id, pipeline_id, name, position, probability, kind")
    .eq("org_id", orgId)
    .eq("id", stageId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as StageRow | null;
}
