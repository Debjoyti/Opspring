import { resolveActiveOrg } from "@/lib/dashboard/org-context";
import { AccountsClient } from "./accounts-client";

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const { activeOrg } = await resolveActiveOrg(org);
  return <AccountsClient orgId={activeOrg.id} />;
}
