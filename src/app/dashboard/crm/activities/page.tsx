import { resolveActiveOrg } from "@/lib/dashboard/org-context";
import { ActivitiesClient } from "./activities-client";

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const { activeOrg } = await resolveActiveOrg(org);
  return <ActivitiesClient orgId={activeOrg.id} />;
}
