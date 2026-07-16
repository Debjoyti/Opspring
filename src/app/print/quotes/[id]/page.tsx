import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveActiveOrg } from "@/lib/dashboard/org-context";
import { lineTotal, quoteTotals } from "@/lib/services/crm/quotes";
import { formatCurrency } from "@/lib/format";
import { PrintButton } from "./print-button";

type QuoteItem = {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  position: number;
};

/**
 * Printable quote view (browser print -> PDF). Server-rendered through the
 * caller's RLS-scoped client, same auth story as the dashboard pages.
 */
export default async function QuotePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ org?: string }>;
}) {
  const { id } = await params;
  const { org } = await searchParams;
  const { activeOrg } = await resolveActiveOrg(org);

  const supabase = await createClient();
  const { data: quote } = await supabase
    .from("crm_quotes")
    .select(
      "*, items:crm_quote_items(*), account:crm_accounts(id, name, phone, website), contact:crm_contacts(id, first_name, last_name, email)",
    )
    .eq("org_id", activeOrg.id)
    .eq("id", id)
    .maybeSingle();
  if (!quote) notFound();

  const items = ((quote.items ?? []) as QuoteItem[]).sort((a, b) => a.position - b.position);
  const totals = quoteTotals(
    items.map((i) => ({
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
      discount_pct: Number(i.discount_pct),
    })),
    Number(quote.discount_pct),
    Number(quote.tax_rate),
  );
  const currency = quote.currency as string;
  const contact = quote.contact as { first_name: string; last_name: string | null; email: string | null } | null;

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-10 print:p-0">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Quote Q-{String(quote.number).padStart(4, "0")}</h1>
          <p className="mt-1 text-muted-foreground">{quote.title}</p>
        </div>
        <PrintButton />
      </div>

      <div className="grid grid-cols-2 gap-8 text-sm">
        <div>
          <div className="font-medium text-muted-foreground">From</div>
          <div className="mt-1 font-medium">{activeOrg.name}</div>
        </div>
        <div>
          <div className="font-medium text-muted-foreground">To</div>
          <div className="mt-1">
            {quote.account ? (
              <div className="font-medium">{(quote.account as { name: string }).name}</div>
            ) : null}
            {contact && (
              <div>
                {[contact.first_name, contact.last_name].filter(Boolean).join(" ")}
                {contact.email ? ` · ${contact.email}` : ""}
              </div>
            )}
            {!quote.account && !contact && <div className="text-muted-foreground">—</div>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-8 text-sm">
        <div>
          <div className="font-medium text-muted-foreground">Status</div>
          <div className="mt-1 capitalize">{quote.status as string}</div>
        </div>
        <div>
          <div className="font-medium text-muted-foreground">Date</div>
          <div className="mt-1">{new Date(quote.created_at as string).toLocaleDateString()}</div>
        </div>
        <div>
          <div className="font-medium text-muted-foreground">Valid until</div>
          <div className="mt-1">{(quote.valid_until as string | null) ?? "—"}</div>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 font-medium">Description</th>
            <th className="py-2 text-right font-medium">Qty</th>
            <th className="py-2 text-right font-medium">Unit price</th>
            <th className="py-2 text-right font-medium">Discount</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b">
              <td className="py-2">{item.description}</td>
              <td className="py-2 text-right">{Number(item.quantity)}</td>
              <td className="py-2 text-right">{formatCurrency(Number(item.unit_price), currency)}</td>
              <td className="py-2 text-right">
                {Number(item.discount_pct) > 0 ? `${Number(item.discount_pct)}%` : "—"}
              </td>
              <td className="py-2 text-right">
                {formatCurrency(
                  lineTotal({
                    quantity: Number(item.quantity),
                    unit_price: Number(item.unit_price),
                    discount_pct: Number(item.discount_pct),
                  }),
                  currency,
                )}
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-center text-muted-foreground">
                No line items
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="ml-auto w-64 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatCurrency(totals.subtotal, currency)}</span>
        </div>
        {totals.discount > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Discount ({Number(quote.discount_pct)}%)</span>
            <span>-{formatCurrency(totals.discount, currency)}</span>
          </div>
        )}
        {totals.tax > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tax ({Number(quote.tax_rate)}%)</span>
            <span>{formatCurrency(totals.tax, currency)}</span>
          </div>
        )}
        <div className="flex justify-between border-t pt-1 text-base font-semibold">
          <span>Total</span>
          <span>{formatCurrency(totals.total, currency)}</span>
        </div>
      </div>

      {(quote.notes || quote.terms) && (
        <div className="space-y-4 text-sm">
          {quote.notes ? (
            <div>
              <div className="font-medium text-muted-foreground">Notes</div>
              <p className="mt-1 whitespace-pre-wrap">{quote.notes as string}</p>
            </div>
          ) : null}
          {quote.terms ? (
            <div>
              <div className="font-medium text-muted-foreground">Terms</div>
              <p className="mt-1 whitespace-pre-wrap">{quote.terms as string}</p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
