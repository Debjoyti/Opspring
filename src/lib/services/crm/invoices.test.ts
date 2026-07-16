import { describe, expect, it } from "vitest";
import {
  DELETABLE_STATUSES,
  EDITABLE_STATUSES,
  INVOICE_TRANSITIONS,
  PAYABLE_STATUSES,
} from "./invoices";

describe("invoice status machine", () => {
  it("only drafts can be sent, and open invoices voided", () => {
    expect(INVOICE_TRANSITIONS.draft).toEqual(["sent", "void"]);
    expect(INVOICE_TRANSITIONS.sent).toEqual(["void"]);
    expect(INVOICE_TRANSITIONS.partially_paid).toEqual(["void"]);
  });

  it("terminal states allow no transitions", () => {
    expect(INVOICE_TRANSITIONS.paid).toEqual([]);
    expect(INVOICE_TRANSITIONS.void).toEqual([]);
  });

  it("payments only apply to sent or partially paid invoices", () => {
    expect(PAYABLE_STATUSES).toEqual(["sent", "partially_paid"]);
  });

  it("only drafts are editable; drafts and voids deletable", () => {
    expect(EDITABLE_STATUSES).toEqual(["draft"]);
    expect(DELETABLE_STATUSES).toEqual(["draft", "void"]);
  });

  it("never allows a paid-family status via the API transition map", () => {
    const apiReachable = new Set(Object.values(INVOICE_TRANSITIONS).flat());
    expect(apiReachable.has("paid")).toBe(false);
    expect(apiReachable.has("partially_paid")).toBe(false);
  });
});
