"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { quoteTotals, QUOTE_TRANSITIONS } from "@/lib/services/crm/quotes";
import { formatCurrency } from "@/lib/format";

type QuoteItem = {
  id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
};

type Quote = {
  id: string;
  number: number;
  title: string;
  status: string;
  currency: string;
  discount_pct: number;
  tax_rate: number;
  valid_until: string | null;
  notes: string | null;
  items: QuoteItem[];
  account: { id: string; name: string } | null;
  contact: { id: string; first_name: string; last_name: string | null } | null;
  deal: { id: string; name: string } | null;
};

type Product = {
  id: string;
  name: string;
  unit_price: number;
  active: boolean;
};

type Deal = { id: string; name: string };
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
  accepted: "default",
  declined: "destructive",
  expired: "outline",
};

const STATUS_ACTION_LABEL: Record<string, string> = {
  sent: "Send",
  accepted: "Accept",
  declined: "Decline",
  expired: "Expire",
};

const quoteNo = (n: number) => `Q-${String(n).padStart(4, "0")}`;

function totalsOf(quote: Quote) {
  return quoteTotals(
    quote.items.map((i) => ({
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
      discount_pct: Number(i.discount_pct),
    })),
    Number(quote.discount_pct),
    Number(quote.tax_rate),
  );
}

const emptyDraftItem = (): DraftItem => ({
  product_id: "",
  description: "",
  quantity: 1,
  unit_price: 0,
  discount_pct: 0,
});

export function QuotesClient({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useCrmList<Quote>("quotes", orgId);
  const { data: products } = useCrmList<Product>("products", orgId);
  const { data: deals } = useCrmList<Deal>("deals", orgId);
  const { data: accounts } = useCrmList<Account>("accounts", orgId);
  const remove = useCrmDelete("quotes", orgId);

  const [builderOpen, setBuilderOpen] = useState(false);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([emptyDraftItem()]);
  const [detailQuote, setDetailQuote] = useState<Quote | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["crm", "quotes", orgId] });
  const activeProducts = (products ?? []).filter((p) => p.active);

  const createQuote = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      crmFetch("quotes", orgId, { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      setBuilderOpen(false);
      setDraftItems([emptyDraftItem()]);
      invalidate();
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : "Failed to create quote"),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      crmFetch(`quotes/${id}/status`, orgId, {
        method: "POST",
        body: JSON.stringify({ status }),
      }),
    onSuccess: invalidate,
    onError: (err) => alert(err instanceof Error ? err.message : "Status change failed"),
  });

  const addItem = useMutation({
    mutationFn: ({ quoteId, item }: { quoteId: string; item: Omit<DraftItem, "product_id"> & { product_id?: string } }) =>
      crmFetch(`quotes/${quoteId}/items`, orgId, {
        method: "POST",
        body: JSON.stringify({ ...item, product_id: item.product_id || undefined }),
      }),
    onSuccess: invalidate,
  });

  const removeItem = useMutation({
    mutationFn: (itemId: string) => crmFetch(`quote-items/${itemId}`, orgId, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  // Keep the detail dialog in sync after invalidations.
  const detail = detailQuote ? (data ?? []).find((q) => q.id === detailQuote.id) ?? null : null;

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
    createQuote.mutate({
      title: String(fd.get("title") ?? ""),
      deal_id: String(fd.get("deal_id") ?? "") || undefined,
      account_id: String(fd.get("account_id") ?? "") || undefined,
      currency: String(fd.get("currency") || "USD"),
      discount_pct: Number(fd.get("discount_pct") || 0),
      tax_rate: Number(fd.get("tax_rate") || 0),
      valid_until: String(fd.get("valid_until") ?? ""),
      notes: String(fd.get("notes") ?? ""),
      items: items.length > 0 ? items : undefined,
    });
  }

  const draftTotals = quoteTotals(
    draftItems.filter((i) => i.description.trim()),
    0,
    0,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Quotes</h1>
        <Button
          onClick={() => {
            setFormError(null);
            setDraftItems([emptyDraftItem()]);
            setBuilderOpen(true);
          }}
        >
          New quote
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">Failed to load quotes.</p>}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Total</TableHead>
              <TableHead className="w-56 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : (data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  No quotes yet. Build your first one.
                </TableCell>
              </TableRow>
            ) : (
              (data ?? []).map((quote) => {
                const totals = totalsOf(quote);
                const nextStatuses = QUOTE_TRANSITIONS[quote.status] ?? [];
                return (
                  <TableRow key={quote.id}>
                    <TableCell className="font-mono text-xs">{quoteNo(quote.number)}</TableCell>
                    <TableCell>
                      <button
                        className="font-medium hover:underline"
                        onClick={() => setDetailQuote(quote)}
                      >
                        {quote.title}
                      </button>
                      {quote.deal && (
                        <div className="text-xs text-muted-foreground">{quote.deal.name}</div>
                      )}
                    </TableCell>
                    <TableCell>{quote.account?.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[quote.status] ?? "outline"}>
                        {quote.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatCurrency(totals.total, quote.currency)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        {nextStatuses.map((status) => (
                          <Button
                            key={status}
                            variant={status === "declined" ? "destructive" : "outline"}
                            size="sm"
                            className="h-7"
                            disabled={setStatus.isPending}
                            onClick={() => setStatus.mutate({ id: quote.id, status })}
                          >
                            {STATUS_ACTION_LABEL[status] ?? status}
                          </Button>
                        ))}
                        <a
                          href={`/print/quotes/${quote.id}?org=${orgId}`}
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
                            if (confirm("Delete this quote?")) remove.mutate(quote.id);
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
            <DialogTitle>New quote</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" required placeholder="Annual platform license" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="deal_id">Deal (optional)</Label>
                <select
                  id="deal_id"
                  name="deal_id"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="">— none —</option>
                  {(deals ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Linking a deal copies its line items when none are added below.
                </p>
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
              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDraftItems((items) => [...items, emptyDraftItem()])}
                >
                  Add line
                </Button>
                <span className="text-sm text-muted-foreground">
                  Items subtotal: {formatCurrency(draftTotals.subtotal)}
                </span>
              </div>
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
                <Label htmlFor="valid_until">Valid until</Label>
                <Input id="valid_until" name="valid_until" type="date" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" rows={2} />
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button type="submit" disabled={createQuote.isPending}>
                Create quote
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail: edit items on an existing quote */}
      <Dialog open={Boolean(detail)} onOpenChange={(o) => !o && setDetailQuote(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {quoteNo(detail.number)} · {detail.title}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant={STATUS_VARIANT[detail.status] ?? "outline"}>{detail.status}</Badge>
                  {detail.account && <span className="text-muted-foreground">{detail.account.name}</span>}
                  {detail.valid_until && (
                    <span className="text-muted-foreground">valid until {detail.valid_until}</span>
                  )}
                </div>

                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="w-16">Qty</TableHead>
                        <TableHead className="w-24">Price</TableHead>
                        <TableHead className="w-16">Disc%</TableHead>
                        <TableHead className="w-24 text-right">Line</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.description}</TableCell>
                          <TableCell>{Number(item.quantity)}</TableCell>
                          <TableCell>{formatCurrency(Number(item.unit_price), detail.currency)}</TableCell>
                          <TableCell>{Number(item.discount_pct)}%</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(
                              Number(item.quantity) * Number(item.unit_price) * (1 - Number(item.discount_pct) / 100),
                              detail.currency,
                            )}
                          </TableCell>
                          <TableCell>
                            {detail.status === "draft" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-1.5"
                                onClick={() => removeItem.mutate(item.id)}
                              >
                                ✕
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {detail.status === "draft" && (
                  <form
                    className="grid grid-cols-12 items-center gap-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      const description = String(fd.get("description") ?? "").trim();
                      if (!description) return;
                      addItem.mutate({
                        quoteId: detail.id,
                        item: {
                          description,
                          quantity: Number(fd.get("quantity") || 1),
                          unit_price: Number(fd.get("unit_price") || 0),
                          discount_pct: Number(fd.get("discount_pct") || 0),
                        },
                      });
                      e.currentTarget.reset();
                    }}
                  >
                    <Input name="description" placeholder="Add an item…" className="col-span-6 h-8 text-xs" />
                    <Input name="quantity" type="number" defaultValue={1} min="0.01" step="0.01" className="col-span-2 h-8 text-xs" />
                    <Input name="unit_price" type="number" defaultValue={0} min="0" step="0.01" className="col-span-2 h-8 text-xs" />
                    <Input name="discount_pct" type="number" defaultValue={0} min="0" max="100" className="col-span-1 h-8 text-xs" />
                    <Button type="submit" size="sm" className="col-span-1 h-8" disabled={addItem.isPending}>
                      +
                    </Button>
                  </form>
                )}

                {(() => {
                  const totals = totalsOf(detail);
                  return (
                    <div className="ml-auto w-56 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span>{formatCurrency(totals.subtotal, detail.currency)}</span>
                      </div>
                      {totals.discount > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Discount ({Number(detail.discount_pct)}%)</span>
                          <span>-{formatCurrency(totals.discount, detail.currency)}</span>
                        </div>
                      )}
                      {totals.tax > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Tax ({Number(detail.tax_rate)}%)</span>
                          <span>{formatCurrency(totals.tax, detail.currency)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t pt-1 font-medium">
                        <span>Total</span>
                        <span>{formatCurrency(totals.total, detail.currency)}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
