import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { resolveActiveOrg } from "@/lib/dashboard/org-context";
import { titleCase } from "@/lib/format";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const { userId, activeOrg } = await resolveActiveOrg(org);

  const supabase = await createClient();
  const { data: members } = await supabase
    .from("memberships")
    .select("id, user_id, role, status, created_at")
    .eq("org_id", activeOrg.id)
    .order("created_at", { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Members</h1>
        <p className="text-sm text-muted-foreground">{activeOrg.name}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {(members ?? []).length} member{(members ?? []).length === 1 ? "" : "s"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {(members ?? []).map((member) => (
              <li key={member.id} className="flex items-center justify-between py-2 text-sm">
                <span className="font-mono text-xs text-muted-foreground">
                  {member.user_id === userId ? "You" : member.user_id}
                </span>
                <span className="flex items-center gap-2">
                  <span className="capitalize">{titleCase(member.role)}</span>
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
