-- Finished products (what Bundling makes) now have stock per location, like ingredients do.
-- Every production run puts its pieces into one lot at a stock location. A product transfer
-- (Production > LTO & LTI) moves pieces between locations by creating a child lot at the receiving
-- location (source_lot_id points back at the lot it was split from). Available pieces use the same
-- formula as ingredient batches: qty_received - qty_consumed + qty_adjusted (qty_consumed is for
-- deliveries and sales to draw on later).
CREATE TABLE product_lots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  lot_number VARCHAR(40) NOT NULL,
  bundle_product_id INT NOT NULL,
  location_id INT NOT NULL,
  production_id INT NOT NULL,
  source_lot_id INT NULL,
  qty_received DECIMAL(12,3) NOT NULL,
  qty_consumed DECIMAL(12,3) NOT NULL DEFAULT 0,
  qty_adjusted DECIMAL(12,3) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pl_product FOREIGN KEY (bundle_product_id) REFERENCES bundle_products(id),
  CONSTRAINT fk_pl_location FOREIGN KEY (location_id) REFERENCES delivery_locations(id),
  CONSTRAINT fk_pl_production FOREIGN KEY (production_id) REFERENCES bundle_productions(id),
  CONSTRAINT fk_pl_source FOREIGN KEY (source_lot_id) REFERENCES product_lots(id),
  UNIQUE KEY uq_pl_number (lot_number),
  KEY idx_pl_location (location_id, bundle_product_id)
) ENGINE=InnoDB;

-- Runs recorded before this existed go to the production location (else the first location).
INSERT INTO product_lots (lot_number, bundle_product_id, location_id, production_id, qty_received)
SELECT p.production_number, p.bundle_product_id,
       COALESCE((SELECT MIN(id) FROM delivery_locations WHERE is_production = 1), (SELECT MIN(id) FROM delivery_locations)),
       p.id, p.qty_produced
  FROM bundle_productions p;

-- LTO = the send (this row, status In transit); LTI = the receipt (receipt_number, received_date,
-- status Received). status: 1 = In transit, 2 = Received, 3 = Cancelled.
CREATE TABLE product_transfers (
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
  CONSTRAINT fk_pt_from FOREIGN KEY (from_location_id) REFERENCES delivery_locations(id),
  CONSTRAINT fk_pt_to FOREIGN KEY (to_location_id) REFERENCES delivery_locations(id),
  CONSTRAINT fk_pt_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_pt_received_by FOREIGN KEY (received_by) REFERENCES users(id),
  KEY idx_pt_status (status),
  KEY idx_pt_date (transfer_date)
) ENGINE=InnoDB;

-- qty_sent leaves the source lot at LTO. At LTI the receiver enters qty_received (at most qty_sent);
-- that quantity becomes the new lot at the receiving location and the difference is the transfer loss.
CREATE TABLE product_transfer_lines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_transfer_id INT NOT NULL,
  source_lot_id INT NOT NULL,
  bundle_product_id INT NOT NULL,
  qty_sent DECIMAL(12,3) NOT NULL,
  qty_received DECIMAL(12,3) NULL,
  new_lot_id INT NULL,
  CONSTRAINT fk_ptl_transfer FOREIGN KEY (product_transfer_id) REFERENCES product_transfers(id) ON DELETE CASCADE,
  CONSTRAINT fk_ptl_source FOREIGN KEY (source_lot_id) REFERENCES product_lots(id),
  CONSTRAINT fk_ptl_product FOREIGN KEY (bundle_product_id) REFERENCES bundle_products(id),
  CONSTRAINT fk_ptl_new_lot FOREIGN KEY (new_lot_id) REFERENCES product_lots(id)
) ENGINE=InnoDB;
