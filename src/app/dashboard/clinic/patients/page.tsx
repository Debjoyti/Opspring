import { resolveActiveOrg } from "@/lib/dashboard/org-context";
import { PatientsClient } from "./patients-client";

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const { activeOrg } = await resolveActiveOrg(org);
  return <PatientsClient orgId={activeOrg.id} />;
}
