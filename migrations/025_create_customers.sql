-- Customer master (the sales-side twin of suppliers). Sales and customer receipts can now point at a
-- customer, so "how much has this customer bought / paid / still owes" can be answered. Nothing is
-- computed into the customers table: totals are derived from sales and receipts.
-- credit_limit is optional; when set, the Customers screen flags customers whose outstanding exceeds it.
CREATE TABLE customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  contact_person VARCHAR(150) NULL,
  phone VARCHAR(30) NULL,
  email VARCHAR(150) NULL,
  address VARCHAR(255) NULL,
  gstin VARCHAR(20) NULL,
  payment_terms VARCHAR(50) NOT NULL DEFAULT 'Net 15 days',
  credit_limit DECIMAL(14,2) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

ALTER TABLE sales ADD COLUMN customer_id INT NULL AFTER customer;
ALTER TABLE receipts ADD COLUMN customer_id INT NULL AFTER account_id;

-- Customer names already typed into the sales register become customers (same name = same customer).
INSERT IGNORE INTO customers (name) SELECT DISTINCT TRIM(customer) FROM sales WHERE customer IS NOT NULL AND TRIM(customer) <> '';
UPDATE sales s JOIN customers c ON c.name = TRIM(s.customer) SET s.customer_id = c.id;

ALTER TABLE sales
  ADD CONSTRAINT fk_sale_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  ADD KEY idx_sale_customer (customer_id);
ALTER TABLE receipts
  ADD CONSTRAINT fk_receipt_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  ADD KEY idx_receipt_customer (customer_id);
