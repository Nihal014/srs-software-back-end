-- The client's costing sheet keeps two quantities per ingredient: the TARGET per piece (the recipe) and what
-- was actually USED that day. A production run now records both: target_qty is the recipe's quantity scaled
-- to the run, used_qty is what was really taken from stock (it defaults to the target and can be changed when the
-- run is recorded). The difference, at the rate in force, is the ingredient variance on the run.
CREATE TABLE bundle_production_ingredients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  production_id INT NOT NULL,
  item_id INT NOT NULL,
  target_qty DECIMAL(14,3) NOT NULL,
  used_qty DECIMAL(14,3) NOT NULL,
  rate DECIMAL(12,2) NOT NULL,
  CONSTRAINT fk_bpi_production FOREIGN KEY (production_id) REFERENCES bundle_productions(id) ON DELETE CASCADE,
  CONSTRAINT fk_bpi_item FOREIGN KEY (item_id) REFERENCES items(id),
  UNIQUE KEY uq_bpi_production_item (production_id, item_id)
) ENGINE=InnoDB;
