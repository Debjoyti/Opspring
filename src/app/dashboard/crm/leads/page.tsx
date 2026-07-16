import { resolveActiveOrg } from "@/lib/dashboard/org-context";
import { LeadsClient } from "./leads-client";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const { activeOrg } = await resolveActiveOrg(org);
  return <LeadsClient orgId={activeOrg.id} />;
}
