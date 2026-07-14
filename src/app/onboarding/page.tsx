import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUserAndRoles } from "@/lib/supabase/claims";
import { createOrganization } from "./actions";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { user } = await getVerifiedUserAndRoles(supabase);

  if (!user) redirect("/login");

  // Users with orgs land here too, via the dashboard's "+ New organization"
  // link — this page doubles as first-run onboarding and additional-org
  // creation, so no redirect for existing members. Checked via an RLS-backed
  // query (same source of truth as the dashboard), not the JWT claim, which
  // can be stale or absent when the access-token hook isn't enabled.
  const { data: existingOrgs } = await supabase.from("organizations").select("id").limit(1);
  const hasOrgs = (existingOrgs ?? []).length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{hasOrgs ? "Create a new organization" : "Create your organization"}</CardTitle>
        <CardDescription>You&apos;ll be its owner.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}

        <form action={createOrganization} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="name">Organization name</Label>
            <Input id="name" name="name" required autoFocus />
          </div>
          <Button type="submit" className="w-full">
            Create organization
          </Button>
        </form>

        {hasOrgs && (
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/dashboard" className="font-medium text-foreground underline">
              Back to dashboard
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
