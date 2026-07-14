"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${base || "org"}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function createOrganization(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect("/onboarding?error=Organization name is required");
  }

  const supabase = await createClient();
  const { data: org, error } = await supabase.rpc("create_organization_with_owner", {
    p_name: name,
    p_slug: slugify(name),
  });

  if (error) {
    redirect(`/onboarding?error=${encodeURIComponent(error.message)}`);
  }

  // The org_roles claim is only in the JWT after it's re-minted.
  await supabase.auth.refreshSession();

  // Land on the org that was just created — without ?org= the dashboard
  // defaults to the user's oldest org, which reads as "nothing happened"
  // when creating a second one.
  redirect(org?.id ? `/dashboard?org=${org.id}` : "/dashboard");
}
