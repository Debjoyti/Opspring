import { resolveActiveOrg } from "@/lib/dashboard/org-context";
import { PipelineSettingsClient } from "./pipeline-settings-client";

export default async function CrmSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const { activeOrg } = await resolveActiveOrg(org);
  return <PipelineSettingsClient orgId={activeOrg.id} />;
}
