// Numeric code convention, mirrored by hand in the frontend (stock-transfer.model.ts).
export const STOCK_TRANSFER_STATUS = {
  InTransit: 1,
  Received: 2,
  Cancelled: 3,
} as const;
export type StockTransferStatus = (typeof STOCK_TRANSFER_STATUS)[keyof typeof STOCK_TRANSFER_STATUS];
