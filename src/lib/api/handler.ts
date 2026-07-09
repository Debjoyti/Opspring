import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUserAndRoles } from "@/lib/supabase/claims";
import type { OrgRole } from "@/lib/rbac";

export type ApiContext = {
  userId: string;
  orgId: string;
  role: OrgRole;
  supabase: SupabaseClient;
};

type Handler = (req: Request, ctx: ApiContext) => Promise<Response> | Response;

/**
 * Central guard for every /app/api/v1/** route. Fails closed: no user, no
 * x-org-id header, no membership in that org, or wrong role -> rejected
 * before the handler runs. Enforced again by real RLS underneath.
 */
export function withOrgAuth(
  handler: Handler,
  options: { requiredRoles?: readonly OrgRole[] } = {},
) {
  return async (req: Request) => {
    const supabase = await createClient();
    const { user, orgRoles } = await getVerifiedUserAndRoles(supabase);

    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const orgId = req.headers.get("x-org-id");
    if (!orgId) {
      return NextResponse.json({ error: "missing x-org-id header" }, { status: 400 });
    }

    const role = orgRoles[orgId];
    if (!role) {
      return NextResponse.json(
        { error: "not a member of this organization" },
        { status: 403 },
      );
    }

    if (options.requiredRoles && !options.requiredRoles.includes(role)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    return handler(req, { userId: user.id, orgId, role, supabase });
  };
}
