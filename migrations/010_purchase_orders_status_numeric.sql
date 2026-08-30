-- Status moves from a string ENUM to a numeric code (1 = Draft ... 8 = Cancelled,
-- matching PO_STATUS in po.interface.ts). Existing rows are remapped in place.
ALTER TABLE purchase_orders ADD COLUMN status_num TINYINT NOT NULL DEFAULT 1 AFTER status;

UPDATE purchase_orders SET status_num = CASE status
  WHEN 'draft' THEN 1
  WHEN 'pending_approval' THEN 2
  WHEN 'approved' THEN 3
  WHEN 'sent_to_supplier' THEN 4
  WHEN 'partially_received' THEN 5
  WHEN 'fully_received' THEN 6
  WHEN 'closed' THEN 7
  WHEN 'cancelled' THEN 8
END;

ALTER TABLE purchase_orders DROP COLUMN status;
ALTER TABLE purchase_orders CHANGE status_num status TINYINT NOT NULL DEFAULT 1;
