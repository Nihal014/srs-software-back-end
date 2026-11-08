-- Recipe Inventory (finished products): stock audits (physical counts), wastage, and the ledger of
-- every lot change they cause. Corrections are never overwrites: they change product_lots.qty_adjusted
-- and leave a row in product_lot_adjustments saying why.

-- A physical count of one location. Each line compares what was counted with what the system expected.
CREATE TABLE product_stock_audits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  audit_number VARCHAR(30) NOT NULL UNIQUE,
  location_id INT NOT NULL,
  audit_date DATE NOT NULL,
  remarks VARCHAR(255) NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_psa_location FOREIGN KEY (location_id) REFERENCES delivery_locations(id),
  CONSTRAINT fk_psa_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  KEY idx_psa_date (audit_date)
) ENGINE=InnoDB;

CREATE TABLE product_stock_audit_lines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  audit_id INT NOT NULL,
  bundle_product_id INT NOT NULL,
  system_qty DECIMAL(12,3) NOT NULL,
  counted_qty DECIMAL(12,3) NOT NULL,
  difference DECIMAL(12,3) NOT NULL,
  unit_cost DECIMAL(12,2) NOT NULL,
  CONSTRAINT fk_psal_audit FOREIGN KEY (audit_id) REFERENCES product_stock_audits(id) ON DELETE CASCADE,
  CONSTRAINT fk_psal_product FOREIGN KEY (bundle_product_id) REFERENCES bundle_products(id),
  UNIQUE KEY uq_psal (audit_id, bundle_product_id)
) ENGINE=InnoDB;

-- Finished pieces thrown away or unsellable. reason: 1 = Spoiled / expired, 2 = Damaged,
-- 3 = Quality rejected, 4 = Other. unit_cost is the cost per piece of the lots it was taken from.
CREATE TABLE product_wastage (
  id INT AUTO_INCREMENT PRIMARY KEY,
  wastage_number VARCHAR(30) NOT NULL UNIQUE,
  wastage_date DATE NOT NULL,
  location_id INT NOT NULL,
  bundle_product_id INT NOT NULL,
  qty DECIMAL(12,3) NOT NULL,
  reason TINYINT NOT NULL,
  remarks VARCHAR(250) NULL,
  unit_cost DECIMAL(12,2) NOT NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pw_location FOREIGN KEY (location_id) REFERENCES delivery_locations(id),
  CONSTRAINT fk_pw_product FOREIGN KEY (bundle_product_id) REFERENCES bundle_products(id),
  CONSTRAINT fk_pw_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  KEY idx_pw_date (wastage_date)
) ENGINE=InnoDB;

-- Which lots a wastage or audit correction took pieces from (qty is signed: negative removes stock).
-- reason: 1 = Wastage, 2 = Stock audit.
CREATE TABLE product_lot_adjustments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  lot_id INT NOT NULL,
  qty DECIMAL(12,3) NOT NULL,
  reason TINYINT NOT NULL,
  wastage_id INT NULL,
  audit_id INT NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pla_lot FOREIGN KEY (lot_id) REFERENCES product_lots(id),
  CONSTRAINT fk_pla_wastage FOREIGN KEY (wastage_id) REFERENCES product_wastage(id),
  CONSTRAINT fk_pla_audit FOREIGN KEY (audit_id) REFERENCES product_stock_audits(id),
  CONSTRAINT fk_pla_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  KEY idx_pla_lot (lot_id)
) ENGINE=InnoDB;
