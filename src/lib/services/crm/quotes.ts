/**
 * Quote math, kept pure so the API, the print view, and the client builder
 * all agree on the numbers (and so it's directly unit-testable).
 */

export type QuoteLine = {
  quantity: number;
  unit_price: number;
  discount_pct: number;
};

export type QuoteTotals = {
  subtotal: number; // after per-line discounts
  discount: number; // quote-level discount amount
  tax: number;
  total: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function lineTotal(line: QuoteLine): number {
  return round2(line.quantity * line.unit_price * (1 - line.discount_pct / 100));
}

export function quoteTotals(
  lines: QuoteLine[],
  quoteDiscountPct: number,
  taxRatePct: number,
): QuoteTotals {
  const subtotal = round2(lines.reduce((sum, line) => sum + lineTotal(line), 0));
  const discount = round2(subtotal * (quoteDiscountPct / 100));
  const taxable = round2(subtotal - discount);
  const tax = round2(taxable * (taxRatePct / 100));
  return { subtotal, discount, tax, total: round2(taxable + tax) };
}

/** Allowed quote status transitions; anything else is a 409. */
export const QUOTE_TRANSITIONS: Record<string, string[]> = {
  draft: ["sent"],
  sent: ["accepted", "declined", "expired"],
  accepted: [],
  declined: [],
  expired: ["sent"],
};

/** Timestamp column stamped when a quote enters the given status. */
export const QUOTE_STATUS_STAMP: Record<string, string> = {
  sent: "sent_at",
  accepted: "accepted_at",
  declined: "declined_at",
};
