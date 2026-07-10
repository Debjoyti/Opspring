import type { SupabaseClient } from "@supabase/supabase-js";
import type { UIMessage } from "ai";

/** One conversation per (user, org) — see supabase/migrations/0005_ai_assistant.sql. */
export async function getOrCreateConversation(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
): Promise<{ id: string }> {
  const { data: existing, error: selectError } = await supabase
    .from("ai_conversations")
    .select("id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();

  if (selectError) throw new Error(`Could not load conversation: ${selectError.message}`);
  if (existing) return existing;

  const { data: created, error: insertError } = await supabase
    .from("ai_conversations")
    .insert({ org_id: orgId, user_id: userId })
    .select("id")
    .single();

  if (insertError) throw new Error(`Could not create conversation: ${insertError.message}`);
  return created;
}

export async function loadMessages(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<UIMessage[]> {
  const { data, error } = await supabase
    .from("ai_messages")
    .select("id, role, parts, metadata")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Could not load messages: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    role: row.role,
    parts: row.parts,
    metadata: row.metadata ?? undefined,
  })) as UIMessage[];
}

/**
 * Messages are immutable once written (insert-only grants — see the
 * migration). `ignoreDuplicates` makes re-saving the same turn a no-op
 * instead of an error, since the client resends full history each request.
 */
export async function saveNewMessages(
  supabase: SupabaseClient,
  conversationId: string,
  orgId: string,
  messages: UIMessage[],
): Promise<void> {
  if (messages.length === 0) return;

  const rows = messages.map((message) => ({
    id: message.id,
    conversation_id: conversationId,
    org_id: orgId,
    role: message.role,
    parts: message.parts,
    metadata: (message as { metadata?: unknown }).metadata ?? null,
  }));

  const { error } = await supabase
    .from("ai_messages")
    .upsert(rows, { onConflict: "id", ignoreDuplicates: true });

  if (error) throw new Error(`Could not save messages: ${error.message}`);

  await supabase
    .from("ai_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);
}
