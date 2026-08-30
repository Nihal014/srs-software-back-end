CREATE TABLE grns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  grn_number VARCHAR(30) NOT NULL UNIQUE,
  purchase_order_id INT NOT NULL,
  received_date DATE NOT NULL,
  remarks VARCHAR(255),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_grn_po FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id)
) ENGINE=InnoDB;
