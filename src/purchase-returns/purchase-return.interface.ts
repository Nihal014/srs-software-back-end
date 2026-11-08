// Numeric code convention, mirrored by hand in the frontend (purchase-return.model.ts).
export const PURCHASE_RETURN_REASON = {
  Damaged: 1,
  WrongItem: 2,
  QualityNotAsOrdered: 3,
  Expired: 4,
  ExcessQuantity: 5,
  Other: 6,
} as const;
export type PurchaseReturnReason = (typeof PURCHASE_RETURN_REASON)[keyof typeof PURCHASE_RETURN_REASON];

export const PURCHASE_RETURN_CREDIT = {
  Pending: 1,
  Received: 2,
} as const;
export type PurchaseReturnCredit = (typeof PURCHASE_RETURN_CREDIT)[keyof typeof PURCHASE_RETURN_CREDIT];
