import { resolveActiveOrg } from "@/lib/dashboard/org-context";
import { QuotesClient } from "./quotes-client";

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const { activeOrg } = await resolveActiveOrg(org);
  return <QuotesClient orgId={activeOrg.id} />;
}
