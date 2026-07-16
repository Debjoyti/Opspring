import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { lineTotal, quoteTotals } from "@/lib/services/crm/quotes";
import { formatCurrency } from "@/lib/format";
import { respondToQuote } from "./actions";

type PublicQuote = {
  number: number;
  title: string;
  status: string;
  currency: string;
  discount_pct: number;
  tax_rate: number;
  valid_until: string | null;
  notes: string | null;
  terms: string | null;
  created_at: string;
  org_name: string;
  account_name: string | null;
  items: {
    description: string;
    quantity: number;
    unit_price: number;
    discount_pct: number;
  }[];
};

/**
 * Customer-facing quote page. Anonymous by design (see proxy.ts) — all data
 * access goes through the SECURITY DEFINER crm_quote_public() function that
 * exposes exactly one non-draft quote per 128-bit token.
 */
export default async function PublicQuotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = /^[0-9a-f-]{36}$/i.test(token)
    ? await supabase.rpc("crm_quote_public", { p_token: token })
    : { data: null };
  const quote = data as PublicQuote | null;

  if (!quote) {
    return (
      <div className="mx-auto max-w-lg p-10 text-center">
        <h1 className="text-2xl font-semibold">Quote not found</h1>
        <p className="mt-2 text-muted-foreground">
          This link is invalid, or the quote is no longer available.
        </p>
      </div>
    );
  }

  const totals = quoteTotals(
    quote.items.map((i) => ({
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
      discount_pct: Number(i.discount_pct),
    })),
    Number(quote.discount_pct),
    Number(quote.tax_rate),
  );

  const acceptAction = respondToQuote.bind(null, token, true);
  const declineAction = respondToQuote.bind(null, token, false);

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6 sm:p-10">
      <div>
        <p className="text-sm text-muted-foreground">{quote.org_name}</p>
        <h1 className="mt-1 text-3xl font-semibold">
          Quote Q-{String(quote.number).padStart(4, "0")}
        </h1>
        <p className="mt-1 text-muted-foreground">{quote.title}</p>
        {quote.account_name && (
          <p className="mt-1 text-sm text-muted-foreground">Prepared for {quote.account_name}</p>
        )}
      </div>

      {quote.status === "accepted" && (
        <div className="rounded-md border border-emerald-600/40 bg-emerald-600/10 p-4 text-emerald-700">
          This quote has been accepted. Thank you!
        </div>
      )}
      {quote.status === "declined" && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-destructive">
          This quote was declined.
        </div>
      )}
      {quote.status === "expired" && (
        <div className="rounded-md border p-4 text-muted-foreground">
          This quote has expired. Contact {quote.org_name} for an updated one.
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 font-medium">Description</th>
            <th className="py-2 text-right font-medium">Qty</th>
            <th className="py-2 text-right font-medium">Unit price</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {quote.items.map((item, idx) => (
            <tr key={idx} className="border-b">
              <td className="py-2">{item.description}</td>
              <td className="py-2 text-right">{Number(item.quantity)}</td>
              <td className="py-2 text-right">
                {formatCurrency(Number(item.unit_price), quote.currency)}
              </td>
              <td className="py-2 text-right">
                {formatCurrency(
                  lineTotal({
                    quantity: Number(item.quantity),
                    unit_price: Number(item.unit_price),
                    discount_pct: Number(item.discount_pct),
                  }),
                  quote.currency,
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto w-64 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatCurrency(totals.subtotal, quote.currency)}</span>
        </div>
        {totals.discount > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Discount ({Number(quote.discount_pct)}%)</span>
            <span>-{formatCurrency(totals.discount, quote.currency)}</span>
          </div>
        )}
        {totals.tax > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tax ({Number(quote.tax_rate)}%)</span>
            <span>{formatCurrency(totals.tax, quote.currency)}</span>
          </div>
        )}
        <div className="flex justify-between border-t pt-1 text-base font-semibold">
          <span>Total</span>
          <span>{formatCurrency(totals.total, quote.currency)}</span>
        </div>
      </div>

      {quote.status === "sent" && (
        <div className="flex items-center justify-end gap-3 border-t pt-6">
          {quote.valid_until && (
            <span className="mr-auto text-sm text-muted-foreground">
              Valid until {quote.valid_until}
            </span>
          )}
          <form action={declineAction}>
            <Button type="submit" variant="outline">
              Decline
            </Button>
          </form>
          <form action={acceptAction}>
            <Button type="submit">Accept quote</Button>
          </form>
        </div>
      )}

      {(quote.notes || quote.terms) && (
        <div className="space-y-4 text-sm">
          {quote.notes ? (
            <div>
              <div className="font-medium text-muted-foreground">Notes</div>
              <p className="mt-1 whitespace-pre-wrap">{quote.notes}</p>
            </div>
          ) : null}
          {quote.terms ? (
            <div>
              <div className="font-medium text-muted-foreground">Terms</div>
              <p className="mt-1 whitespace-pre-wrap">{quote.terms}</p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
