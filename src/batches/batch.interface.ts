// Numeric code convention, mirrored by hand in the frontend (batch.model.ts).
export const BATCH_ADJUSTMENT_REASON = {
  Expired: 1,
  Damaged: 2,
  CountCorrection: 3,
  Other: 4,
} as const;
export type BatchAdjustmentReason = (typeof BATCH_ADJUSTMENT_REASON)[keyof typeof BATCH_ADJUSTMENT_REASON];
