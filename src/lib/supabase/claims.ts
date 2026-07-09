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
  return { user, orgRoles: decodeOrgRoles(session?.access_token) };
}
