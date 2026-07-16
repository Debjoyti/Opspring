import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/handler";

export type SearchHit = {
  type: "lead" | "contact" | "account" | "deal" | "product" | "quote";
  id: string;
  title: string;
  subtitle: string | null;
};

const LIMIT_PER_TYPE = 5;

/**
 * Cross-entity search. ILIKE over the trigram-indexed columns; the query is
 * stripped of PostgREST or-syntax metacharacters before interpolation.
 */
export const GET = withOrgAuth(async (req, ctx) => {
  const raw = new URL(req.url).searchParams.get("q") ?? "";
  const q = raw.replace(/[,()%_\\]/g, " ").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ data: [] });
  const pattern = `%${q}%`;

  const [leads, contacts, accounts, deals, products, quotes] = await Promise.all([
    ctx.supabase
      .from("crm_leads")
      .select("id, name, company, email")
      .eq("org_id", ctx.orgId)
      .or(`name.ilike.${pattern},company.ilike.${pattern},email.ilike.${pattern}`)
      .limit(LIMIT_PER_TYPE),
    ctx.supabase
      .from("crm_contacts")
      .select("id, first_name, last_name, email")
      .eq("org_id", ctx.orgId)
      .or(`first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern}`)
      .limit(LIMIT_PER_TYPE),
    ctx.supabase
      .from("crm_accounts")
      .select("id, name, industry")
      .eq("org_id", ctx.orgId)
      .ilike("name", pattern)
      .limit(LIMIT_PER_TYPE),
    ctx.supabase
      .from("crm_deals")
      .select("id, name, amount, currency")
      .eq("org_id", ctx.orgId)
      .ilike("name", pattern)
      .limit(LIMIT_PER_TYPE),
    ctx.supabase
      .from("crm_products")
      .select("id, name, sku")
      .eq("org_id", ctx.orgId)
      .or(`name.ilike.${pattern},sku.ilike.${pattern}`)
      .limit(LIMIT_PER_TYPE),
    ctx.supabase
      .from("crm_quotes")
      .select("id, number, title, status")
      .eq("org_id", ctx.orgId)
      .ilike("title", pattern)
      .limit(LIMIT_PER_TYPE),
  ]);

  for (const res of [leads, contacts, accounts, deals, products, quotes]) {
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  }

  const hits: SearchHit[] = [
    ...(leads.data ?? []).map((r) => ({
      type: "lead" as const,
      id: r.id as string,
      title: r.name as string,
      subtitle: [r.company, r.email].filter(Boolean).join(" · ") || null,
    })),
    ...(contacts.data ?? []).map((r) => ({
      type: "contact" as const,
      id: r.id as string,
      title: [r.first_name, r.last_name].filter(Boolean).join(" "),
      subtitle: (r.email as string | null) ?? null,
    })),
    ...(accounts.data ?? []).map((r) => ({
      type: "account" as const,
      id: r.id as string,
      title: r.name as string,
      subtitle: (r.industry as string | null) ?? null,
    })),
    ...(deals.data ?? []).map((r) => ({
      type: "deal" as const,
      id: r.id as string,
      title: r.name as string,
      subtitle: `${r.currency} ${Number(r.amount ?? 0).toLocaleString()}`,
    })),
    ...(products.data ?? []).map((r) => ({
      type: "product" as const,
      id: r.id as string,
      title: r.name as string,
      subtitle: (r.sku as string | null) ?? null,
    })),
    ...(quotes.data ?? []).map((r) => ({
      type: "quote" as const,
      id: r.id as string,
      title: `Q-${String(r.number).padStart(4, "0")} ${r.title}`,
      subtitle: r.status as string,
    })),
  ];

  return NextResponse.json({ data: hits });
});
