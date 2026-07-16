import { resolveActiveOrg } from "@/lib/dashboard/org-context";
import { InvoicesClient } from "./invoices-client";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const { activeOrg } = await resolveActiveOrg(org);
  return <InvoicesClient orgId={activeOrg.id} />;
}
