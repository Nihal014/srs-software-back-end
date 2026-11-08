// Numeric code convention, mirrored by hand in the frontend (product-inventory.model.ts).
export const PRODUCT_WASTAGE_REASON = {
  Spoiled: 1,
  Damaged: 2,
  QualityRejected: 3,
  Other: 4,
} as const;
export type ProductWastageReason = (typeof PRODUCT_WASTAGE_REASON)[keyof typeof PRODUCT_WASTAGE_REASON];

// Why a finished-product lot's pieces changed (product_lot_adjustments.reason).
export const PRODUCT_LOT_ADJUSTMENT_REASON = {
  Wastage: 1,
  StockAudit: 2,
} as const;
