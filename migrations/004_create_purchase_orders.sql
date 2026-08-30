CREATE TABLE purchase_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  po_number VARCHAR(30) NOT NULL UNIQUE,
  supplier_id INT NOT NULL,
  status ENUM('draft','pending_approval','approved','sent_to_supplier','partially_received','fully_received','closed','cancelled') NOT NULL DEFAULT 'draft',
  delivery_location VARCHAR(150) NOT NULL DEFAULT 'Kollam Production Unit',
  expected_date DATE,
  payment_terms VARCHAR(50) NOT NULL DEFAULT 'Net 15 days',
  remarks VARCHAR(255),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_po_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
) ENGINE=InnoDB;
