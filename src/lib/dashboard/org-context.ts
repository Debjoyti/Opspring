import { redirect } from "next/navigation";
import { getDashboardSession } from "@/lib/dashboard/session";
import type { OrgRole } from "@/lib/rbac";

export type ActiveOrg = {
  id: string;
  name: string;
  slug: string;
  role: OrgRole | undefined;
};

/**
 * Resolves the active org from ?org= (falling back to the first org) and
 * guards the whole dashboard: unauthenticated -> /login, no orgs ->
 * /onboarding. Shared by the layout and every dashboard page so the active
 * org is consistent across a request.
 */
export async function resolveActiveOrg(orgParam: string | undefined): Promise<{
  userId: string;
  organizations: { id: string; name: string; slug: string }[];
  activeOrg: ActiveOrg;
}> {
  const { user, orgRoles, organizations } = await getDashboardSession();
  if (!user) redirect("/login");
  if (organizations.length === 0) redirect("/onboarding");

  const match = organizations.find((o) => o.id === orgParam) ?? organizations[0];

  return {
    userId: user.id,
    organizations,
    activeOrg: { ...match, role: orgRoles[match.id] },
  };
}
