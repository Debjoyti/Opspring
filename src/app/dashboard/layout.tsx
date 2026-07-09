import Link from "next/link";
import { redirect } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { getDashboardSession } from "@/lib/dashboard/session";
import { signOut } from "../(auth)/actions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Layouts don't receive `searchParams` in the App Router — the active-org
  // selection (?org=) is read in page.tsx instead. This shell just lists
  // orgs to switch between.
  const { user, organizations } = await getDashboardSession();
  if (!user) redirect("/login");
  if (organizations.length === 0) redirect("/onboarding");

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="font-semibold">Opspring</span>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm">
                  Switch organization
                </Button>
              }
            />
            <DropdownMenuContent align="start">
              {organizations.map((org) => (
                <DropdownMenuItem key={org.id} render={<Link href={`/dashboard?org=${org.id}`} />}>
                  {org.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem render={<Link href="/onboarding" />}>
                + New organization
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
