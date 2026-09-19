-- A Bundle Product is a finished, sellable item made by combining raw items
-- per a Bill of Materials (BOM). bom lines store qty required per ONE unit
-- of output, in the raw item's own master unit (e.g. 0.294 kg Maida per pc) —
-- scaled up at production time by the quantity being produced.
CREATE TABLE bundle_products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  output_unit VARCHAR(20) NOT NULL,
  selling_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE bundle_bom_lines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bundle_product_id INT NOT NULL,
  item_id INT NOT NULL,
  qty_per_unit DECIMAL(12,4) NOT NULL,
  CONSTRAINT fk_bom_bundle FOREIGN KEY (bundle_product_id) REFERENCES bundle_products(id) ON DELETE CASCADE,
  CONSTRAINT fk_bom_item FOREIGN KEY (item_id) REFERENCES items(id),
  UNIQUE KEY uq_bom_bundle_item (bundle_product_id, item_id)
) ENGINE=InnoDB;
