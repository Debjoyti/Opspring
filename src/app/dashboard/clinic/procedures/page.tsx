import { resolveActiveOrg } from "@/lib/dashboard/org-context";
import { ProceduresClient } from "./procedures-client";

export default async function ProceduresPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const { activeOrg } = await resolveActiveOrg(org);
  return <ProceduresClient orgId={activeOrg.id} />;
}
