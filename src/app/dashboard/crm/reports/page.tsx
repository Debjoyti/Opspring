import { resolveActiveOrg } from "@/lib/dashboard/org-context";
import { ReportsClient } from "./reports-client";

export default async function CrmReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const { activeOrg } = await resolveActiveOrg(org);
  return <ReportsClient orgId={activeOrg.id} />;
}
