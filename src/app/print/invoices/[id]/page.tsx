import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveActiveOrg } from "@/lib/dashboard/org-context";
import { lineTotal, quoteTotals } from "@/lib/services/crm/quotes";
import { formatCurrency } from "@/lib/format";
import { PrintButton } from "../../quotes/[id]/print-button";

type InvoiceItem = {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  position: number;
};

/** Printable invoice (browser print -> PDF), server-rendered under RLS. */
export default async function InvoicePrintPage({
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
  const { data: invoice } = await supabase
    .from("crm_invoices")
    .select(
      "*, items:crm_invoice_items(*), account:crm_accounts(id, name), contact:crm_contacts(id, first_name, last_name, email)",
    )
    .eq("org_id", activeOrg.id)
    .eq("id", id)
    .maybeSingle();
  if (!invoice) notFound();

  const items = ((invoice.items ?? []) as InvoiceItem[]).sort((a, b) => a.position - b.position);
  const totals = quoteTotals(
    items.map((i) => ({
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
      discount_pct: Number(i.discount_pct),
    })),
    Number(invoice.discount_pct),
    Number(invoice.tax_rate),
  );
  const currency = invoice.currency as string;
  const paid = Number(invoice.paid_total ?? 0);
  const contact = invoice.contact as {
    first_name: string;
    last_name: string | null;
    email: string | null;
  } | null;

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-10 print:p-0">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold">
            Invoice INV-{String(invoice.number).padStart(4, "0")}
          </h1>
          <p className="mt-1 text-muted-foreground">{invoice.title as string}</p>
        </div>
        <PrintButton />
      </div>

      <div className="grid grid-cols-2 gap-8 text-sm">
        <div>
          <div className="font-medium text-muted-foreground">From</div>
          <div className="mt-1 font-medium">{activeOrg.name}</div>
        </div>
        <div>
          <div className="font-medium text-muted-foreground">Bill to</div>
          <div className="mt-1">
            {invoice.account ? (
              <div className="font-medium">{(invoice.account as { name: string }).name}</div>
            ) : null}
            {contact && (
              <div>
                {[contact.first_name, contact.last_name].filter(Boolean).join(" ")}
                {contact.email ? ` · ${contact.email}` : ""}
              </div>
            )}
            {!invoice.account && !contact && <div className="text-muted-foreground">—</div>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-8 text-sm">
        <div>
          <div className="font-medium text-muted-foreground">Status</div>
          <div className="mt-1 capitalize">{(invoice.status as string).replace("_", " ")}</div>
        </div>
        <div>
          <div className="font-medium text-muted-foreground">Issued</div>
          <div className="mt-1">{invoice.issue_date as string}</div>
        </div>
        <div>
          <div className="font-medium text-muted-foreground">Due</div>
          <div className="mt-1">{(invoice.due_date as string | null) ?? "—"}</div>
        </div>
        <div>
          <div className="font-medium text-muted-foreground">Amount due</div>
          <div className="mt-1 font-semibold">
            {formatCurrency(Math.max(0, totals.total - paid), currency)}
          </div>
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
            <span className="text-muted-foreground">
              Discount ({Number(invoice.discount_pct)}%)
            </span>
            <span>-{formatCurrency(totals.discount, currency)}</span>
          </div>
        )}
        {totals.tax > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tax ({Number(invoice.tax_rate)}%)</span>
            <span>{formatCurrency(totals.tax, currency)}</span>
          </div>
        )}
        <div className="flex justify-between border-t pt-1 text-base font-semibold">
          <span>Total</span>
          <span>{formatCurrency(totals.total, currency)}</span>
        </div>
        {paid > 0 && (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Paid</span>
              <span>-{formatCurrency(paid, currency)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Amount due</span>
              <span>{formatCurrency(Math.max(0, totals.total - paid), currency)}</span>
            </div>
          </>
        )}
      </div>

      {(invoice.notes || invoice.terms) && (
        <div className="space-y-4 text-sm">
          {invoice.notes ? (
            <div>
              <div className="font-medium text-muted-foreground">Notes</div>
              <p className="mt-1 whitespace-pre-wrap">{invoice.notes as string}</p>
            </div>
          ) : null}
          {invoice.terms ? (
            <div>
              <div className="font-medium text-muted-foreground">Terms</div>
              <p className="mt-1 whitespace-pre-wrap">{invoice.terms as string}</p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
