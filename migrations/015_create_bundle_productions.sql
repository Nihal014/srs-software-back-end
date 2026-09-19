-- One row per production run ("made 170 units of Sweet Chattipathiri today").
-- material_cost is the TOTAL raw-material cost for the whole run (sum of
-- bundle_consumptions.cost); labor/overhead are entered per unit (manually
-- for now, matching the client's current Excel process — until Payroll
-- exists to auto-supply the labor figure) and unit_cost is snapshotted at
-- production time so later ingredient-rate changes never rewrite history.
CREATE TABLE bundle_productions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  production_number VARCHAR(40) NOT NULL UNIQUE,
  bundle_product_id INT NOT NULL,
  qty_produced DECIMAL(12,3) NOT NULL,
  produced_date DATE NOT NULL,
  material_cost DECIMAL(12,2) NOT NULL,
  labor_cost_per_unit DECIMAL(12,2) NOT NULL DEFAULT 0,
  overhead_cost_per_unit DECIMAL(12,2) NOT NULL DEFAULT 0,
  unit_cost DECIMAL(12,2) NOT NULL,
  selling_price DECIMAL(12,2) NOT NULL,
  shortage_override TINYINT(1) NOT NULL DEFAULT 0,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_production_bundle FOREIGN KEY (bundle_product_id) REFERENCES bundle_products(id),
  CONSTRAINT fk_production_user FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

-- Exactly which batch(es) were drawn on for this production run, for
-- traceability (Bundle -> Batches -> GRN -> PO -> Supplier) and for
-- reconstructing the true material cost at the rate each batch was bought at.
CREATE TABLE bundle_consumptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  production_id INT NOT NULL,
  batch_id INT NOT NULL,
  item_id INT NOT NULL,
  qty_consumed DECIMAL(12,3) NOT NULL,
  rate_at_time DECIMAL(12,2) NOT NULL,
  cost DECIMAL(12,2) NOT NULL,
  CONSTRAINT fk_consumption_production FOREIGN KEY (production_id) REFERENCES bundle_productions(id) ON DELETE CASCADE,
  CONSTRAINT fk_consumption_batch FOREIGN KEY (batch_id) REFERENCES batches(id),
  CONSTRAINT fk_consumption_item FOREIGN KEY (item_id) REFERENCES items(id)
) ENGINE=InnoDB;
