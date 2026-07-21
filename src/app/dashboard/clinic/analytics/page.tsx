import { resolveActiveOrg } from "@/lib/dashboard/org-context";
import { AnalyticsClient } from "./analytics-client";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const { activeOrg } = await resolveActiveOrg(org);
  return <AnalyticsClient orgId={activeOrg.id} orgName={activeOrg.name} />;
}
