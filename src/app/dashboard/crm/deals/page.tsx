import { resolveActiveOrg } from "@/lib/dashboard/org-context";
import { DealsClient } from "./deals-client";

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const { activeOrg } = await resolveActiveOrg(org);
  return <DealsClient orgId={activeOrg.id} />;
}
