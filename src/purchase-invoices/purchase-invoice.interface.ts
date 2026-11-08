// Numeric code convention, mirrored by hand in the frontend (purchase-invoice.model.ts).
// Derived from the payments, never stored.
export const PAYMENT_STATUS = {
  Unpaid: 1,
  PartPaid: 2,
  Paid: 3,
} as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

export const PAYMENT_STATUS_FILTER = ['unpaid', 'part-paid', 'paid', 'overdue'] as const;
export type PaymentStatusFilter = (typeof PAYMENT_STATUS_FILTER)[number];
