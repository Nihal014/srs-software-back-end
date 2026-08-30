-- One batch per accepted GRN line. qty_consumed/qty_adjusted stay 0 until the
-- Bundling and Inventory-adjustment modules are built; available qty is always
-- derived (qty_received - qty_consumed + qty_adjusted), never stored redundantly.
CREATE TABLE batches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  batch_number VARCHAR(40) NOT NULL UNIQUE,
  item_id INT NOT NULL,
  grn_line_id INT NOT NULL,
  qty_received DECIMAL(12,3) NOT NULL,
  qty_consumed DECIMAL(12,3) NOT NULL DEFAULT 0,
  qty_adjusted DECIMAL(12,3) NOT NULL DEFAULT 0,
  mfg_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  is_quarantined TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_batch_item FOREIGN KEY (item_id) REFERENCES items(id),
  CONSTRAINT fk_batch_grn_line FOREIGN KEY (grn_line_id) REFERENCES grn_lines(id)
) ENGINE=InnoDB;
