"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
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
import { crmFetch, useCrmList } from "@/lib/crm/client";
import { lineTotal } from "@/lib/services/crm/quotes";
import { formatCurrency } from "@/lib/format";

type DealItem = {
  id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  product: { id: string; name: string; sku: string | null } | null;
};

type Product = { id: string; name: string; unit_price: number; active: boolean };

/**
 * Line-item editor for a deal. The deal's amount is recalculated by a DB
 * trigger whenever items change, so the board refreshes via invalidation.
 */
export function DealItemsDialog({
  orgId,
  dealId,
  dealName,
  currency,
  onClose,
}: {
  orgId: string;
  dealId: string | null;
  dealName: string;
  currency: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: products } = useCrmList<Product>("products", orgId);
  const activeProducts = (products ?? []).filter((p) => p.active);

  const [productId, setProductId] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const itemsKey = ["crm", "deal-items", orgId, dealId];
  const { data: items, isLoading } = useQuery({
    queryKey: itemsKey,
    enabled: Boolean(dealId),
    queryFn: () =>
      crmFetch<{ data: DealItem[] }>(`deals/${dealId}/items`, orgId).then((r) => r.data),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: itemsKey });
    qc.invalidateQueries({ queryKey: ["crm", "deals", orgId] });
  };

  const addItem = useMutation({
    mutationFn: () =>
      crmFetch(`deals/${dealId}/items`, orgId, {
        method: "POST",
        body: JSON.stringify({
          product_id: productId || undefined,
          description,
          quantity,
          unit_price: unitPrice,
          discount_pct: discount,
        }),
      }),
    onSuccess: () => {
      setProductId("");
      setDescription("");
      setQuantity(1);
      setUnitPrice(0);
      setDiscount(0);
      setError(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to add item"),
  });

  const removeItem = useMutation({
    mutationFn: (itemId: string) => crmFetch(`deal-items/${itemId}`, orgId, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  function pickProduct(id: string) {
    setProductId(id);
    const product = activeProducts.find((p) => p.id === id);
    if (product) {
      setDescription(product.name);
      setUnitPrice(Number(product.unit_price));
    }
  }

  const total = (items ?? []).reduce(
    (sum, item) =>
      sum +
      lineTotal({
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        discount_pct: Number(item.discount_pct),
      }),
    0,
  );

  return (
    <Dialog open={Boolean(dealId)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Line items · {dealName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-14">Qty</TableHead>
                  <TableHead className="w-24">Price</TableHead>
                  <TableHead className="w-16">Disc%</TableHead>
                  <TableHead className="w-24 text-right">Line</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : (items ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      No items — the deal keeps its manual amount until you add one.
                    </TableCell>
                  </TableRow>
                ) : (
                  (items ?? []).map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {item.description}
                        {item.product?.sku && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({item.product.sku})
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{Number(item.quantity)}</TableCell>
                      <TableCell>{formatCurrency(Number(item.unit_price), currency)}</TableCell>
                      <TableCell>{Number(item.discount_pct)}%</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(
                          lineTotal({
                            quantity: Number(item.quantity),
                            unit_price: Number(item.unit_price),
                            discount_pct: Number(item.discount_pct),
                          }),
                          currency,
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5"
                          onClick={() => removeItem.mutate(item.id)}
                        >
                          ✕
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <form
            className="grid grid-cols-12 items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (description.trim()) addItem.mutate();
            }}
          >
            <select
              value={productId}
              onChange={(e) => pickProduct(e.target.value)}
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
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <Input
              className="col-span-1 h-8 text-xs"
              type="number"
              min="0.01"
              step="0.01"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
            <Input
              className="col-span-2 h-8 text-xs"
              type="number"
              min="0"
              step="0.01"
              value={unitPrice}
              onChange={(e) => setUnitPrice(Number(e.target.value))}
            />
            <Input
              className="col-span-1 h-8 text-xs"
              type="number"
              min="0"
              max="100"
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
            />
            <Button type="submit" size="sm" className="col-span-1 h-8" disabled={addItem.isPending}>
              +
            </Button>
          </form>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end text-sm font-medium">
            Items total: {formatCurrency(total, currency)}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
