import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Every tool runs against the caller's own RLS-scoped Supabase client, so
 * the assistant can never surface another org's data even if a prompt tries
 * to talk it into it — the same real-RLS guarantee as the rest of the app,
 * not an app-code-only check.
 */
export function buildAssistantTools(supabase: SupabaseClient, orgId: string) {
  return {
    listMembers: tool({
      description:
        "List the members of the current organization, with their role and status.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from("memberships")
          .select("user_id, role, status, created_at")
          .eq("org_id", orgId)
          .order("created_at", { ascending: true });

        if (error) throw new Error(`Could not list members: ${error.message}`);
        return { members: data };
      },
    }),

    getOrganizationOverview: tool({
      description:
        "Get the current organization's name, slug, creation date, and a member count by role.",
      inputSchema: z.object({}),
      execute: async () => {
        const [{ data: org, error: orgError }, { data: members, error: membersError }] =
          await Promise.all([
            supabase.from("organizations").select("id, name, slug, created_at").eq("id", orgId).single(),
            supabase.from("memberships").select("role").eq("org_id", orgId),
          ]);

        if (orgError) throw new Error(`Could not load organization: ${orgError.message}`);
        if (membersError) throw new Error(`Could not load members: ${membersError.message}`);

        const roleCounts: Record<string, number> = {};
        for (const m of members ?? []) {
          roleCounts[m.role] = (roleCounts[m.role] ?? 0) + 1;
        }

        return { organization: org, memberCountByRole: roleCounts };
      },
    }),

    summarizeRecentActivity: tool({
      description:
        "Get the organization's most recent audit log entries (org/membership changes) to summarize recent activity.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).default(20).describe("Max entries to fetch"),
      }),
      execute: async ({ limit }) => {
        const { data, error } = await supabase
          .from("audit_log")
          .select("action, entity, entity_id, created_at")
          .eq("org_id", orgId)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (error) throw new Error(`Could not load audit log: ${error.message}`);
        return { entries: data };
      },
    }),
  };
}
