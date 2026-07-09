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
  const { user, orgRoles } = await getVerifiedUserAndRoles(supabase);

  if (!user) redirect("/login");
  if (Object.keys(orgRoles).length > 0) redirect("/dashboard");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your organization</CardTitle>
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
      </CardContent>
    </Card>
  );
}
