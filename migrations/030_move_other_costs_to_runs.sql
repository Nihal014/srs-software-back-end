-- Labour and the itemised "other costs" (freezing, gas & electricity, packing, cold storage, transport...) belong to
-- Bundling & costing, not to the recipe: the recipe only holds the BOQ and the ingredient target cost. So the
-- target labour / other-cost standards added to recipes in 027 are removed, and each production run instead records
-- its own named other costs per unit, as in the client's daily "Costing per piece" block.
DROP TABLE bundle_cost_components;

ALTER TABLE bundle_products DROP COLUMN target_labor_cost;

ALTER TABLE bundle_productions
  DROP COLUMN target_labor_cost_per_unit,
  DROP COLUMN target_overhead_cost_per_unit;

-- overhead_cost_per_unit on the run stays: it is now the sum of these named costs.
CREATE TABLE bundle_production_costs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  production_id INT NOT NULL,
  name VARCHAR(80) NOT NULL,
  amount_per_unit DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_bpc_production FOREIGN KEY (production_id) REFERENCES bundle_productions(id) ON DELETE CASCADE,
  UNIQUE KEY uq_bpc_production_name (production_id, name)
) ENGINE=InnoDB;
