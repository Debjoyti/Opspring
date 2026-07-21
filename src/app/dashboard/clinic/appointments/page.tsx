import { resolveActiveOrg } from "@/lib/dashboard/org-context";
import { AppointmentsView } from "./appointments-view";

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const { activeOrg } = await resolveActiveOrg(org);
  return <AppointmentsView orgId={activeOrg.id} />;
}
