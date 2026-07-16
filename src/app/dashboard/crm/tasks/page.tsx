import { resolveActiveOrg } from "@/lib/dashboard/org-context";
import { TasksClient } from "./tasks-client";

export default async function CrmTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const { activeOrg } = await resolveActiveOrg(org);
  return <TasksClient orgId={activeOrg.id} />;
}
