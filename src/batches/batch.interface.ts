// Numeric code convention, mirrored by hand in the frontend (batch.model.ts).
export const BATCH_ADJUSTMENT_REASON = {
  Expired: 1,
  Damaged: 2,
  CountCorrection: 3,
  Other: 4,
  // Only ever written by a purchase return, never chosen by hand.
  ReturnedToSupplier: 5,
  // Written by stock transfers (LTO / cancelling one), never chosen by hand.
  TransferredOut: 6,
  TransferCancelled: 7,
} as const;
export type BatchAdjustmentReason = (typeof BATCH_ADJUSTMENT_REASON)[keyof typeof BATCH_ADJUSTMENT_REASON];
