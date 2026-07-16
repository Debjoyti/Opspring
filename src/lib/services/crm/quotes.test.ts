import { describe, expect, it } from "vitest";
import { lineTotal, quoteTotals, QUOTE_TRANSITIONS } from "./quotes";

describe("lineTotal", () => {
  it("multiplies quantity by price with a per-line discount", () => {
    expect(lineTotal({ quantity: 3, unit_price: 100, discount_pct: 10 })).toBe(270);
  });

  it("rounds to cents", () => {
    expect(lineTotal({ quantity: 3, unit_price: 0.1, discount_pct: 0 })).toBe(0.3);
  });
});

describe("quoteTotals", () => {
  it("applies line discounts, then quote discount, then tax", () => {
    const totals = quoteTotals(
      [
        { quantity: 2, unit_price: 500, discount_pct: 0 }, // 1000
        { quantity: 1, unit_price: 200, discount_pct: 50 }, // 100
      ],
      10, // -110
      10, // +99
    );
    expect(totals).toEqual({ subtotal: 1100, discount: 110, tax: 99, total: 1089 });
  });

  it("handles an empty quote", () => {
    expect(quoteTotals([], 20, 20)).toEqual({ subtotal: 0, discount: 0, tax: 0, total: 0 });
  });

  it("handles zero discount and tax", () => {
    const totals = quoteTotals([{ quantity: 1, unit_price: 99.99, discount_pct: 0 }], 0, 0);
    expect(totals.total).toBe(99.99);
  });
});

describe("QUOTE_TRANSITIONS", () => {
  it("only allows draft->sent and sent->closed states", () => {
    expect(QUOTE_TRANSITIONS.draft).toEqual(["sent"]);
    expect(QUOTE_TRANSITIONS.sent).toContain("accepted");
    expect(QUOTE_TRANSITIONS.accepted).toEqual([]);
    expect(QUOTE_TRANSITIONS.expired).toEqual(["sent"]);
  });
});
