import { resolveActiveOrg } from "@/lib/dashboard/org-context";
import { ProductsClient } from "./products-client";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const { activeOrg } = await resolveActiveOrg(org);
  return <ProductsClient orgId={activeOrg.id} />;
}
