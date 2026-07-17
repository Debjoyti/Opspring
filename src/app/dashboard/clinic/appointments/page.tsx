import { resolveActiveOrg } from "@/lib/dashboard/org-context";
import { AppointmentsClient } from "./appointments-client";

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const { activeOrg } = await resolveActiveOrg(org);
  return <AppointmentsClient orgId={activeOrg.id} />;
}
