import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/dashboard/sidebar";
import { GlobalSearch } from "@/components/dashboard/global-search";
import { getDashboardSession } from "@/lib/dashboard/session";
import { signOut } from "../(auth)/actions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, orgRoles, organizations } = await getDashboardSession();
  if (!user) redirect("/login");
  if (organizations.length === 0) redirect("/onboarding");

  return (
    <div className="flex min-h-screen flex-1">
      <Sidebar organizations={organizations} orgRoles={orgRoles} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-6 py-3">
          <div className="text-sm text-muted-foreground">{user.email}</div>
          <Suspense>
            <GlobalSearch organizations={organizations} />
          </Suspense>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </header>
        <main className="min-w-0 flex-1 overflow-x-auto p-6">{children}</main>
      </div>
    </div>
  );
}
