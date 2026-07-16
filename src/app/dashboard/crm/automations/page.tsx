import { resolveActiveOrg } from "@/lib/dashboard/org-context";
import { AutomationsClient } from "./automations-client";

export default async function AutomationsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const { activeOrg } = await resolveActiveOrg(org);
  return <AutomationsClient orgId={activeOrg.id} />;
}
