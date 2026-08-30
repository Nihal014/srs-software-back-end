CREATE TABLE grn_lines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  grn_id INT NOT NULL,
  purchase_order_line_id INT NOT NULL,
  item_id INT NOT NULL,
  qty_received DECIMAL(12,3) NOT NULL,
  qty_accepted DECIMAL(12,3) NOT NULL,
  qty_rejected DECIMAL(12,3) NOT NULL DEFAULT 0,
  rejection_reason VARCHAR(255),
  batch_number VARCHAR(40) NOT NULL,
  mfg_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_gl_grn FOREIGN KEY (grn_id) REFERENCES grns(id) ON DELETE CASCADE,
  CONSTRAINT fk_gl_pol FOREIGN KEY (purchase_order_line_id) REFERENCES purchase_order_lines(id),
  CONSTRAINT fk_gl_item FOREIGN KEY (item_id) REFERENCES items(id)
) ENGINE=InnoDB;
