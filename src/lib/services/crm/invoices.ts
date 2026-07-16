/**
 * Invoice status machine. Payments (not API calls) drive the
 * sent -> partially_paid -> paid moves via the crm_recalc_invoice_paid
 * trigger; the API only ever performs the explicit transitions below.
 */

export const INVOICE_TRANSITIONS: Record<string, string[]> = {
  draft: ["sent", "void"],
  sent: ["void"],
  partially_paid: ["void"],
  paid: [],
  void: [],
};

export const INVOICE_STATUS_STAMP: Record<string, string> = {
  sent: "sent_at",
  void: "voided_at",
};

/** Statuses that accept a payment. */
export const PAYABLE_STATUSES = ["sent", "partially_paid"];

/** Statuses in which an invoice (or its items) may still be edited/deleted. */
export const EDITABLE_STATUSES = ["draft"];
export const DELETABLE_STATUSES = ["draft", "void"];
