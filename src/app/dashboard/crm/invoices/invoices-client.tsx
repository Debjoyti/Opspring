"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { crmFetch, useCrmDelete, useCrmList } from "@/lib/crm/client";
import { quoteTotals } from "@/lib/services/crm/quotes";
import { INVOICE_TRANSITIONS } from "@/lib/services/crm/invoices";
import { PAYMENT_METHODS } from "@/lib/services/crm/types";
import { formatCurrency } from "@/lib/format";

type LineItem = {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
};

type Payment = {
  id: string;
  amount: number;
  method: string;
  reference: string | null;
  paid_at: string;
};

type Invoice = {
  id: string;
  number: number;
  title: string;
  status: string;
  currency: string;
  discount_pct: number;
  tax_rate: number;
  issue_date: string;
  due_date: string | null;
  paid_total: number;
  items: LineItem[];
  payments: Payment[];
  account: { id: string; name: string } | null;
  quote: { id: string; number: number; title: string } | null;
};

type Product = { id: string; name: string; unit_price: number; active: boolean };
type Account = { id: string; name: string };

type DraftItem = {
  product_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  sent: "secondary",
  partially_paid: "secondary",
  paid: "default",
  void: "destructive",
};

const invoiceNo = (n: number) => `INV-${String(n).padStart(4, "0")}`;

function totalsOf(invoice: Invoice) {
  return quoteTotals(
    invoice.items.map((i) => ({
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
      discount_pct: Number(i.discount_pct),
    })),
    Number(invoice.discount_pct),
    Number(invoice.tax_rate),
  );
}

const emptyDraftItem = (): DraftItem => ({
  product_id: "",
  description: "",
  quantity: 1,
  unit_price: 0,
  discount_pct: 0,
});

export function InvoicesClient({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useCrmList<Invoice>("invoices", orgId);
  const { data: products } = useCrmList<Product>("products", orgId);
  const { data: accounts } = useCrmList<Account>("accounts", orgId);
  const remove = useCrmDelete("invoices", orgId);

  const [builderOpen, setBuilderOpen] = useState(false);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([emptyDraftItem()]);
  const [paymentsInvoice, setPaymentsInvoice] = useState<Invoice | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["crm", "invoices", orgId] });
  const activeProducts = (products ?? []).filter((p) => p.active);

  const createInvoice = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      crmFetch("invoices", orgId, { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      setBuilderOpen(false);
      setDraftItems([emptyDraftItem()]);
      invalidate();
    },
    onError: (err) =>
      setFormError(err instanceof Error ? err.message : "Failed to create invoice"),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      crmFetch(`invoices/${id}/status`, orgId, {
        method: "POST",
        body: JSON.stringify({ status }),
      }),
    onSuccess: invalidate,
    onError: (err) => alert(err instanceof Error ? err.message : "Status change failed"),
  });

  const addPayment = useMutation({
    mutationFn: ({ invoiceId, payload }: { invoiceId: string; payload: Record<string, unknown> }) =>
      crmFetch(`invoices/${invoiceId}/payments`, orgId, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setPaymentError(null);
      invalidate();
    },
    onError: (err) =>
      setPaymentError(err instanceof Error ? err.message : "Failed to record payment"),
  });

  const removePayment = useMutation({
    mutationFn: (paymentId: string) =>
      crmFetch(`payments/${paymentId}`, orgId, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  // Keep the payments dialog in sync across refetches.
  const paymentsDetail = paymentsInvoice
    ? (data ?? []).find((i) => i.id === paymentsInvoice.id) ?? null
    : null;

  function updateDraftItem(idx: number, patch: Partial<DraftItem>) {
    setDraftItems((items) => items.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  }

  function pickProduct(idx: number, productId: string) {
    const product = activeProducts.find((p) => p.id === productId);
    updateDraftItem(idx, {
      product_id: productId,
      description: product ? product.name : draftItems[idx].description,
      unit_price: product ? Number(product.unit_price) : draftItems[idx].unit_price,
    });
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    const items = draftItems
      .filter((i) => i.description.trim())
      .map((i, idx) => ({
        product_id: i.product_id || undefined,
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unit_price,
        discount_pct: i.discount_pct,
        position: idx,
      }));
    createInvoice.mutate({
      title: String(fd.get("title") ?? ""),
      account_id: String(fd.get("account_id") ?? "") || undefined,
      currency: String(fd.get("currency") || "USD"),
      discount_pct: Number(fd.get("discount_pct") || 0),
      tax_rate: Number(fd.get("tax_rate") || 0),
      issue_date: String(fd.get("issue_date") ?? ""),
      due_date: String(fd.get("due_date") ?? ""),
      items: items.length > 0 ? items : undefined,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Invoices</h1>
          <p className="text-sm text-muted-foreground">
            Accepted quotes convert from the Quotes screen; payments drive paid status.
          </p>
        </div>
        <Button
          onClick={() => {
            setFormError(null);
            setDraftItems([emptyDraftItem()]);
            setBuilderOpen(true);
          }}
        >
          New invoice
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">Failed to load invoices.</p>}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Due</TableHead>
              <TableHead className="w-64 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : (data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  No invoices yet.
                </TableCell>
              </TableRow>
            ) : (
              (data ?? []).map((invoice) => {
                const totals = totalsOf(invoice);
                const due = Math.max(0, totals.total - Number(invoice.paid_total ?? 0));
                const nextStatuses = INVOICE_TRANSITIONS[invoice.status] ?? [];
                return (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-mono text-xs">{invoiceNo(invoice.number)}</TableCell>
                    <TableCell>
                      <span className="font-medium">{invoice.title}</span>
                      {invoice.quote && (
                        <div className="text-xs text-muted-foreground">
                          from Q-{String(invoice.quote.number).padStart(4, "0")}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{invoice.account?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[invoice.status] ?? "outline"}>
                        {invoice.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatCurrency(totals.total, invoice.currency)}</TableCell>
                    <TableCell>
                      {due > 0 ? (
                        formatCurrency(due, invoice.currency)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        {nextStatuses.map((status) => (
                          <Button
                            key={status}
                            variant={status === "void" ? "destructive" : "outline"}
                            size="sm"
                            className="h-7"
                            disabled={setStatus.isPending}
                            onClick={() => setStatus.mutate({ id: invoice.id, status })}
                          >
                            {status === "sent" ? "Send" : "Void"}
                          </Button>
                        ))}
                        {invoice.status !== "draft" && invoice.status !== "void" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7"
                            onClick={() => {
                              setPaymentError(null);
                              setPaymentsInvoice(invoice);
                            }}
                          >
                            Payments
                          </Button>
                        )}
                        <a
                          href={`/print/invoices/${invoice.id}?org=${orgId}`}
                          target="_blank"
                          rel="noreferrer"
                          className={buttonVariants({ variant: "ghost", size: "sm" }) + " h-7"}
                        >
                          Print
                        </a>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7"
                          onClick={() => {
                            if (confirm("Delete this invoice?")) remove.mutate(invoice.id);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Builder */}
      <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New invoice</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" required placeholder="March services" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="account_id">Account (optional)</Label>
              <select
                id="account_id"
                name="account_id"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="">— none —</option>
                {(accounts ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Line items</Label>
              {draftItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 items-center gap-1.5">
                  <select
                    value={item.product_id}
                    onChange={(e) => pickProduct(idx, e.target.value)}
                    className="col-span-3 h-8 rounded-md border border-input bg-transparent px-1 text-xs"
                  >
                    <option value="">Custom</option>
                    {activeProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    className="col-span-4 h-8 text-xs"
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => updateDraftItem(idx, { description: e.target.value })}
                  />
                  <Input
                    className="col-span-1 h-8 text-xs"
                    type="number"
                    min="0.01"
                    step="0.01"
                    title="Quantity"
                    value={item.quantity}
                    onChange={(e) => updateDraftItem(idx, { quantity: Number(e.target.value) })}
                  />
                  <Input
                    className="col-span-2 h-8 text-xs"
                    type="number"
                    min="0"
                    step="0.01"
                    title="Unit price"
                    value={item.unit_price}
                    onChange={(e) => updateDraftItem(idx, { unit_price: Number(e.target.value) })}
                  />
                  <Input
                    className="col-span-1 h-8 text-xs"
                    type="number"
                    min="0"
                    max="100"
                    title="Discount %"
                    value={item.discount_pct}
                    onChange={(e) => updateDraftItem(idx, { discount_pct: Number(e.target.value) })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="col-span-1 h-8"
                    onClick={() => setDraftItems((items) => items.filter((_, i) => i !== idx))}
                  >
                    ✕
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDraftItems((items) => [...items, emptyDraftItem()])}
              >
                Add line
              </Button>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="currency">Currency</Label>
                <Input id="currency" name="currency" defaultValue="USD" maxLength={3} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="discount_pct">Discount %</Label>
                <Input id="discount_pct" name="discount_pct" type="number" min="0" max="100" defaultValue={0} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tax_rate">Tax %</Label>
                <Input id="tax_rate" name="tax_rate" type="number" min="0" max="100" defaultValue={0} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="due_date">Due date</Label>
                <Input id="due_date" name="due_date" type="date" />
              </div>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button type="submit" disabled={createInvoice.isPending}>
                Create invoice
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Payments */}
      <Dialog open={Boolean(paymentsDetail)} onOpenChange={(o) => !o && setPaymentsInvoice(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {paymentsDetail && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Payments · {invoiceNo(paymentsDetail.number)}
                </DialogTitle>
              </DialogHeader>
              {(() => {
                const totals = totalsOf(paymentsDetail);
                const paid = Number(paymentsDetail.paid_total ?? 0);
                const due = Math.max(0, totals.total - paid);
                return (
                  <div className="space-y-3">
                    <div className="flex justify-between rounded-md border p-3 text-sm">
                      <span>
                        Total {formatCurrency(totals.total, paymentsDetail.currency)}
                      </span>
                      <span>
                        Paid {formatCurrency(paid, paymentsDetail.currency)} · Due{" "}
                        <span className="font-semibold">
                          {formatCurrency(due, paymentsDetail.currency)}
                        </span>
                      </span>
                    </div>

                    <div className="space-y-1">
                      {paymentsDetail.payments.length === 0 && (
                        <p className="text-sm text-muted-foreground">No payments recorded.</p>
                      )}
                      {paymentsDetail.payments
                        .slice()
                        .sort((a, b) => b.paid_at.localeCompare(a.paid_at))
                        .map((payment) => (
                          <div
                            key={payment.id}
                            className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                          >
                            <span>
                              {formatCurrency(Number(payment.amount), paymentsDetail.currency)}
                              <span className="ml-2 text-xs text-muted-foreground">
                                {payment.method.replace("_", " ")}
                                {payment.reference ? ` · ${payment.reference}` : ""} ·{" "}
                                {new Date(payment.paid_at).toLocaleDateString()}
                              </span>
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5"
                              onClick={() => removePayment.mutate(payment.id)}
                            >
                              ✕
                            </Button>
                          </div>
                        ))}
                    </div>

                    {due > 0 && (
                      <form
                        className="grid grid-cols-12 items-center gap-1.5"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const fd = new FormData(e.currentTarget);
                          addPayment.mutate({
                            invoiceId: paymentsDetail.id,
                            payload: {
                              amount: Number(fd.get("amount") || 0),
                              method: String(fd.get("method") || "bank_transfer"),
                              reference: String(fd.get("reference") ?? ""),
                            },
                          });
                          e.currentTarget.reset();
                        }}
                      >
                        <Input
                          name="amount"
                          type="number"
                          min="0.01"
                          step="0.01"
                          placeholder={String(due)}
                          className="col-span-4 h-8 text-xs"
                          required
                        />
                        <select
                          name="method"
                          className="col-span-3 h-8 rounded-md border border-input bg-transparent px-1 text-xs"
                        >
                          {PAYMENT_METHODS.map((m) => (
                            <option key={m} value={m}>
                              {m.replace("_", " ")}
                            </option>
                          ))}
                        </select>
                        <Input
                          name="reference"
                          placeholder="Reference"
                          className="col-span-3 h-8 text-xs"
                        />
                        <Button
                          type="submit"
                          size="sm"
                          className="col-span-2 h-8"
                          disabled={addPayment.isPending}
                        >
                          Record
                        </Button>
                      </form>
                    )}
                    {paymentError && <p className="text-sm text-destructive">{paymentError}</p>}
                  </div>
                );
              })()}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
