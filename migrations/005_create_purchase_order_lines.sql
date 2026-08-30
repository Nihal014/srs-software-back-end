CREATE TABLE purchase_order_lines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  purchase_order_id INT NOT NULL,
  item_id INT NOT NULL,
  qty_ordered DECIMAL(12,3) NOT NULL,
  rate DECIMAL(12,2) NOT NULL,
  tax_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  discount DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pol_po FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_pol_item FOREIGN KEY (item_id) REFERENCES items(id)
) ENGINE=InnoDB;
