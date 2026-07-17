import { resolveActiveOrg } from "@/lib/dashboard/org-context";
import { BillingClient } from "./billing-client";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const { activeOrg } = await resolveActiveOrg(org);
  return <BillingClient orgId={activeOrg.id} />;
}
