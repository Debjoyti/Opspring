import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getDashboardSession } from "@/lib/dashboard/session";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { user, orgRoles, organizations } = await getDashboardSession();
  if (!user) redirect("/login");
  if (organizations.length === 0) redirect("/onboarding");

  const { org: requestedOrgId } = await searchParams;
  const activeOrg = organizations.find((o) => o.id === requestedOrgId) ?? organizations[0];
  const activeRole = orgRoles[activeOrg.id];

  const supabase = await createClient();
  const { data: members } = await supabase
    .from("memberships")
    .select("id, user_id, role, status, created_at")
    .eq("org_id", activeOrg.id)
    .order("created_at", { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{activeOrg.name}</h1>
        <p className="text-sm text-muted-foreground">
          Your role: <span className="font-medium capitalize">{activeRole}</span>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {(members ?? []).map((member) => (
              <li key={member.id} className="flex items-center justify-between py-2 text-sm">
                <span className="font-mono text-xs text-muted-foreground">
                  {member.user_id === user.id ? "You" : member.user_id}
                </span>
                <span className="flex items-center gap-2">
                  <span className="capitalize">{member.role}</span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs capitalize text-secondary-foreground">
                    {member.status}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
