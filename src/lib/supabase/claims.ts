import type { SupabaseClient } from "@supabase/supabase-js";
import { isOrgRole, type OrgRole } from "@/lib/rbac";

/**
 * Decodes the `org_roles` claim (org_id -> role map) from an already-verified
 * access token. Only call this after `supabase.auth.getUser()` has confirmed
 * the session is valid — this function itself does no verification, it just
 * reads a JWT payload that's already been authenticated.
 */
export function decodeOrgRoles(accessToken: string | undefined): Record<string, OrgRole> {
  if (!accessToken) return {};
  try {
    const payload = accessToken.split(".")[1];
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const claims = JSON.parse(json) as { org_roles?: Record<string, string> };
    const roles: Record<string, OrgRole> = {};
    for (const [orgId, role] of Object.entries(claims.org_roles ?? {})) {
      if (isOrgRole(role)) roles[orgId] = role;
    }
    return roles;
  } catch {
    return {};
  }
}

/**
 * Verifies the session via getUser() (round-trips to the auth server — never
 * trust getSession() alone for authentication), then reads the org_roles
 * claim from the now-trusted access token.
 */
export async function getVerifiedUserAndRoles(supabase: SupabaseClient) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { user: null, orgRoles: {} as Record<string, OrgRole> };

  const { data: { session } } = await supabase.auth.getSession();
  const orgRoles = decodeOrgRoles(session?.access_token);
  if (Object.keys(orgRoles).length > 0) {
    return { user, orgRoles };
  }

  const { data: memberships } = await supabase
    .from("memberships")
    .select("org_id, role")
    .eq("user_id", user.id)
    .eq("status", "active")
    .is("deleted_at", null);

  for (const membership of memberships ?? []) {
    if (typeof membership.org_id === "string" && isOrgRole(membership.role)) {
      orgRoles[membership.org_id] = membership.role;
    }
  }

  return { user, orgRoles };
}
