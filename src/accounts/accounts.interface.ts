// Numeric code convention, mirrored by hand in the frontend (accounts.model.ts).
export const PL_GROUP = { DirectCost: 1, OtherExpense: 2, Capital: 3 } as const;
export const ACCOUNT_TYPE = { Bank: 1, Cash: 2, Partner: 3 } as const;
export const RECEIPT_SOURCE = { Capital: 1, SalesPayment: 2, CashTransfer: 3, Other: 4 } as const;
export const BILL_STATUS = { Available: 1, PaymentReceipt: 2, NotAvailable: 3 } as const;

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const round2 = (n: number) => Math.round(n * 100) / 100;

export interface ListQuery {
  from?: string;
  to?: string;
  search?: string;
  page?: string;
  pageSize?: string;
  categoryId?: string;
  accountId?: string;
}
