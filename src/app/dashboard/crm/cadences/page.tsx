import { resolveActiveOrg } from "@/lib/dashboard/org-context";
import { CadencesClient } from "./cadences-client";

export default async function CadencesPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const { activeOrg } = await resolveActiveOrg(org);
  return <CadencesClient orgId={activeOrg.id} />;
}
