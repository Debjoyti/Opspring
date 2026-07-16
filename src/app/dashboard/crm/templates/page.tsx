import { resolveActiveOrg } from "@/lib/dashboard/org-context";
import { TemplatesClient } from "./templates-client";

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const { activeOrg } = await resolveActiveOrg(org);
  return <TemplatesClient orgId={activeOrg.id} />;
}
