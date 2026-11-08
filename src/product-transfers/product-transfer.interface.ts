// Numeric code convention, mirrored by hand in the frontend (product-transfer.model.ts).
export const PRODUCT_TRANSFER_STATUS = {
  InTransit: 1,
  Received: 2,
  Cancelled: 3,
} as const;
export type ProductTransferStatus = (typeof PRODUCT_TRANSFER_STATUS)[keyof typeof PRODUCT_TRANSFER_STATUS];
