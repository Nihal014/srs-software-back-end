-- Stock now lives in a location (the existing delivery_locations master, shown as "Stock Location
-- Creation"). Every batch sits in exactly one location: new GRN batches go to the PO's delivery
-- location, and a transfer (LTO then LTI) moves stock by creating a child batch at the receiving
-- location (source_batch_id points back at the batch it was split from). Available stock keeps its
-- single formula: qty_received - qty_consumed + qty_adjusted.
--
-- delivery_locations.is_production marks where Bundling takes ingredients from. While no location
-- is flagged, Bundling keeps using stock from every location (how it worked before transfers).
ALTER TABLE delivery_locations ADD COLUMN is_production TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE batches
  ADD COLUMN location_id INT NULL AFTER item_id,
  ADD COLUMN source_batch_id INT NULL AFTER grn_line_id;

-- Existing batches go where their PO said goods were to be delivered.
UPDATE batches b
  JOIN grn_lines gl ON gl.id = b.grn_line_id
  JOIN grns g ON g.id = gl.grn_id
  JOIN purchase_orders po ON po.id = g.purchase_order_id
  JOIN delivery_locations dl ON dl.name = po.delivery_location
   SET b.location_id = dl.id;

-- A database with no locations at all gets one, so every batch can have a home.
INSERT INTO delivery_locations (name) SELECT 'Main Store' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM delivery_locations);
UPDATE batches SET location_id = (SELECT MIN(id) FROM delivery_locations) WHERE location_id IS NULL;

ALTER TABLE batches
  MODIFY location_id INT NOT NULL,
  ADD CONSTRAINT fk_batch_location FOREIGN KEY (location_id) REFERENCES delivery_locations(id),
  ADD CONSTRAINT fk_batch_source FOREIGN KEY (source_batch_id) REFERENCES batches(id),
  ADD KEY idx_batch_location (location_id);

-- A transfer between two locations. LTO = the send (this row, status In transit); LTI = the receipt
-- (receipt_number, received_date, status Received). status: 1 = In transit, 2 = Received, 3 = Cancelled.
CREATE TABLE stock_transfers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  transfer_number VARCHAR(30) NOT NULL UNIQUE,
  receipt_number VARCHAR(30) NULL UNIQUE,
  from_location_id INT NOT NULL,
  to_location_id INT NOT NULL,
  transfer_date DATE NOT NULL,
  status TINYINT NOT NULL DEFAULT 1,
  remarks VARCHAR(255) NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  received_date DATE NULL,
  receive_remarks VARCHAR(255) NULL,
  received_by INT NULL,
  CONSTRAINT fk_st_from FOREIGN KEY (from_location_id) REFERENCES delivery_locations(id),
  CONSTRAINT fk_st_to FOREIGN KEY (to_location_id) REFERENCES delivery_locations(id),
  CONSTRAINT fk_st_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_st_received_by FOREIGN KEY (received_by) REFERENCES users(id),
  KEY idx_st_status (status),
  KEY idx_st_date (transfer_date)
) ENGINE=InnoDB;

-- qty_sent leaves the source batch at LTO. At LTI the receiver enters qty_received (at most qty_sent);
-- that quantity becomes the new batch at the receiving location and the difference is the transfer loss.
CREATE TABLE stock_transfer_lines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  stock_transfer_id INT NOT NULL,
  source_batch_id INT NOT NULL,
  item_id INT NOT NULL,
  qty_sent DECIMAL(12,3) NOT NULL,
  qty_received DECIMAL(12,3) NULL,
  new_batch_id INT NULL,
  CONSTRAINT fk_stl_transfer FOREIGN KEY (stock_transfer_id) REFERENCES stock_transfers(id) ON DELETE CASCADE,
  CONSTRAINT fk_stl_source FOREIGN KEY (source_batch_id) REFERENCES batches(id),
  CONSTRAINT fk_stl_item FOREIGN KEY (item_id) REFERENCES items(id),
  CONSTRAINT fk_stl_new_batch FOREIGN KEY (new_batch_id) REFERENCES batches(id)
) ENGINE=InnoDB;
