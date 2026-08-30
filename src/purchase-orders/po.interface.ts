export const PO_STATUS = {
  Draft: 1,
  PendingApproval: 2,
  Approved: 3,
  SentToSupplier: 4,
  PartiallyReceived: 5,
  FullyReceived: 6,
  Closed: 7,
  Cancelled: 8,
} as const;

export type PoStatus = (typeof PO_STATUS)[keyof typeof PO_STATUS];

export const PO_STATUS_LABEL: Record<PoStatus, string> = {
  [PO_STATUS.Draft]: 'Draft',
  [PO_STATUS.PendingApproval]: 'Pending Approval',
  [PO_STATUS.Approved]: 'Approved',
  [PO_STATUS.SentToSupplier]: 'Sent to Supplier',
  [PO_STATUS.PartiallyReceived]: 'Partially Received',
  [PO_STATUS.FullyReceived]: 'Fully Received',
  [PO_STATUS.Closed]: 'Closed',
  [PO_STATUS.Cancelled]: 'Cancelled',
};

export interface PurchaseOrder {
  id: number;
  po_number: string;
  supplier_id: number;
  status: PoStatus;
  delivery_location: string;
  expected_date: string | null;
  payment_terms: string;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderLine {
  id: number;
  purchase_order_id: number;
  item_id: number;
  qty_ordered: number;
  rate: number;
  tax_percent: number;
  discount: number;
}
