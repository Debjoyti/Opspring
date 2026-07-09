import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUserAndRoles } from "@/lib/supabase/claims";

/**
 * Memoized per-request: layout and page both call this without issuing
 * duplicate queries. RLS (not this function) is what actually restricts
 * `organizations` to the caller's orgs — this just shapes it for the UI.
 */
export const getDashboardSession = cache(async () => {
  const supabase = await createClient();
  const { user, orgRoles } = await getVerifiedUserAndRoles(supabase);

  if (!user) {
    return { user: null, orgRoles: {}, organizations: [] };
  }

  const { data: organizations } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .order("created_at", { ascending: true });

  return { user, orgRoles, organizations: organizations ?? [] };
});
