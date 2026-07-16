import { resolveActiveOrg } from "@/lib/dashboard/org-context";
import { ContactsClient } from "./contacts-client";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const { activeOrg } = await resolveActiveOrg(org);
  return <ContactsClient orgId={activeOrg.id} />;
}
