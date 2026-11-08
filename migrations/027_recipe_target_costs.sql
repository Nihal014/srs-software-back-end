-- A recipe's full target cost per piece = ingredients (the BOQ at current item rates) + target labour
-- + its named "other costs" per piece (freezing, gas & electricity, packing, cold storage, transport...).
-- This is the client's costing sheet: material + labour + the itemised overheads = total unit cost.
ALTER TABLE bundle_products
  ADD COLUMN target_labor_cost DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER selling_price;

CREATE TABLE bundle_cost_components (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bundle_product_id INT NOT NULL,
  name VARCHAR(80) NOT NULL,
  amount_per_unit DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_bcc_bundle FOREIGN KEY (bundle_product_id) REFERENCES bundle_products(id) ON DELETE CASCADE,
  UNIQUE KEY uq_bcc_bundle_name (bundle_product_id, name)
) ENGINE=InnoDB;

-- Each production run keeps a snapshot of the recipe's target per piece at the moment it was recorded, so
-- the run can show actual against target and later recipe edits never rewrite history. NULL on older runs.
ALTER TABLE bundle_productions
  ADD COLUMN target_material_cost_per_unit DECIMAL(12,2) NULL AFTER unit_cost,
  ADD COLUMN target_labor_cost_per_unit DECIMAL(12,2) NULL AFTER target_material_cost_per_unit,
  ADD COLUMN target_overhead_cost_per_unit DECIMAL(12,2) NULL AFTER target_labor_cost_per_unit;
