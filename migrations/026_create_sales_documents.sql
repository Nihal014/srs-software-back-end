-- The sales document chain: Quotation -> Sales Order -> Delivery Note -> Sales Invoice (+ payments),
-- with Sales Returns crediting an invoice. Sellable things are the finished products (bundle_products).
--
-- Money keeps flowing through the existing Accounts tables so P&L, receivables and the Cash Book stay
-- right without anyone entering it twice:
--   * a sales invoice writes one row into the `sales` register (sale_id),
--   * a payment on an invoice writes a customer-payment row into `receipts` (receipt_id),
--   * a sales return writes a negative row into the `sales` register (sale_id).
-- Paid / credited / outstanding and the Unpaid / Part paid / Paid status are always derived.

-- Where sales are made or goods are sent from (a shop, counter, route...). Optional on every document.
CREATE TABLE sales_locations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  address VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- status: 1 = Open, 2 = Accepted, 3 = Rejected, 4 = Converted to a sales order. "Expired" is derived from valid_until.
CREATE TABLE quotations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  quotation_number VARCHAR(30) NOT NULL UNIQUE,
  customer_id INT NOT NULL,
  sales_location_id INT NULL,
  quotation_date DATE NOT NULL,
  valid_until DATE NOT NULL,
  status TINYINT NOT NULL DEFAULT 1,
  remarks VARCHAR(255) NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_quo_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_quo_location FOREIGN KEY (sales_location_id) REFERENCES sales_locations(id),
  CONSTRAINT fk_quo_user FOREIGN KEY (created_by) REFERENCES users(id),
  KEY idx_quo_status (status)
) ENGINE=InnoDB;

CREATE TABLE quotation_lines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  quotation_id INT NOT NULL,
  product_id INT NOT NULL,
  qty DECIMAL(12,3) NOT NULL,
  rate DECIMAL(12,2) NOT NULL,
  tax_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  discount DECIMAL(12,2) NOT NULL DEFAULT 0,
  CONSTRAINT fk_quol_quotation FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE,
  CONSTRAINT fk_quol_product FOREIGN KEY (product_id) REFERENCES bundle_products(id)
) ENGINE=InnoDB;

-- status: 1 = Open, 2 = Partially delivered, 3 = Delivered, 4 = Cancelled. 1-3 follow the delivery notes.
CREATE TABLE sales_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_number VARCHAR(30) NOT NULL UNIQUE,
  customer_id INT NOT NULL,
  sales_location_id INT NULL,
  quotation_id INT NULL UNIQUE,
  order_date DATE NOT NULL,
  expected_date DATE NULL,
  status TINYINT NOT NULL DEFAULT 1,
  remarks VARCHAR(255) NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_so_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_so_location FOREIGN KEY (sales_location_id) REFERENCES sales_locations(id),
  CONSTRAINT fk_so_quotation FOREIGN KEY (quotation_id) REFERENCES quotations(id),
  CONSTRAINT fk_so_user FOREIGN KEY (created_by) REFERENCES users(id),
  KEY idx_so_status (status)
) ENGINE=InnoDB;

CREATE TABLE sales_order_lines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sales_order_id INT NOT NULL,
  product_id INT NOT NULL,
  qty_ordered DECIMAL(12,3) NOT NULL,
  rate DECIMAL(12,2) NOT NULL,
  tax_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  discount DECIMAL(12,2) NOT NULL DEFAULT 0,
  CONSTRAINT fk_sol_order FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_sol_product FOREIGN KEY (product_id) REFERENCES bundle_products(id)
) ENGINE=InnoDB;

-- Goods handed over against a sales order (finished-goods stock is not tracked, so no stock moves).
CREATE TABLE delivery_notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  dn_number VARCHAR(30) NOT NULL UNIQUE,
  sales_order_id INT NOT NULL,
  delivery_date DATE NOT NULL,
  received_by VARCHAR(100) NULL,
  vehicle_no VARCHAR(30) NULL,
  remarks VARCHAR(255) NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_dn_order FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id),
  CONSTRAINT fk_dn_user FOREIGN KEY (created_by) REFERENCES users(id),
  KEY idx_dn_date (delivery_date)
) ENGINE=InnoDB;

CREATE TABLE delivery_note_lines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  delivery_note_id INT NOT NULL,
  sales_order_line_id INT NOT NULL,
  product_id INT NOT NULL,
  qty_delivered DECIMAL(12,3) NOT NULL,
  CONSTRAINT fk_dnl_note FOREIGN KEY (delivery_note_id) REFERENCES delivery_notes(id) ON DELETE CASCADE,
  CONSTRAINT fk_dnl_order_line FOREIGN KEY (sales_order_line_id) REFERENCES sales_order_lines(id),
  CONSTRAINT fk_dnl_product FOREIGN KEY (product_id) REFERENCES bundle_products(id)
) ENGINE=InnoDB;

-- An invoice raised from a delivery note, or directly (counter sales). One invoice per delivery note.
-- amount = sum of the line amounts; sale_id is the matching row in the sales register.
CREATE TABLE sales_invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_number VARCHAR(30) NOT NULL UNIQUE,
  customer_id INT NOT NULL,
  sales_order_id INT NULL,
  delivery_note_id INT NULL UNIQUE,
  sales_location_id INT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  remarks VARCHAR(255) NULL,
  sale_id INT NULL UNIQUE,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_si_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_si_order FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id),
  CONSTRAINT fk_si_note FOREIGN KEY (delivery_note_id) REFERENCES delivery_notes(id),
  CONSTRAINT fk_si_location FOREIGN KEY (sales_location_id) REFERENCES sales_locations(id),
  CONSTRAINT fk_si_sale FOREIGN KEY (sale_id) REFERENCES sales(id),
  CONSTRAINT fk_si_user FOREIGN KEY (created_by) REFERENCES users(id),
  KEY idx_si_due (due_date)
) ENGINE=InnoDB;

CREATE TABLE sales_invoice_lines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sales_invoice_id INT NOT NULL,
  product_id INT NOT NULL,
  qty DECIMAL(12,3) NOT NULL,
  rate DECIMAL(12,2) NOT NULL,
  tax_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  discount DECIMAL(12,2) NOT NULL DEFAULT 0,
  amount DECIMAL(14,2) NOT NULL,
  CONSTRAINT fk_sil_invoice FOREIGN KEY (sales_invoice_id) REFERENCES sales_invoices(id) ON DELETE CASCADE,
  CONSTRAINT fk_sil_product FOREIGN KEY (product_id) REFERENCES bundle_products(id)
) ENGINE=InnoDB;

-- Money received against an invoice; receipt_id is the customer-payment row it created in Receipts.
CREATE TABLE sales_invoice_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sales_invoice_id INT NOT NULL,
  payment_date DATE NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  account_id INT NOT NULL,
  receipt_id INT NOT NULL,
  reference VARCHAR(100) NULL,
  remarks VARCHAR(255) NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sip_invoice FOREIGN KEY (sales_invoice_id) REFERENCES sales_invoices(id),
  CONSTRAINT fk_sip_account FOREIGN KEY (account_id) REFERENCES accounts(id),
  CONSTRAINT fk_sip_receipt FOREIGN KEY (receipt_id) REFERENCES receipts(id),
  CONSTRAINT fk_sip_user FOREIGN KEY (created_by) REFERENCES users(id),
  KEY idx_sip_invoice (sales_invoice_id)
) ENGINE=InnoDB;

-- Goods a customer sent back against an invoice. total_amount credits the invoice (and, through
-- sale_id, a negative row in the sales register). reason is numeric - see SALES_RETURN_REASON.
CREATE TABLE sales_returns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  return_number VARCHAR(30) NOT NULL UNIQUE,
  sales_invoice_id INT NOT NULL,
  customer_id INT NOT NULL,
  return_date DATE NOT NULL,
  total_amount DECIMAL(14,2) NOT NULL,
  remarks VARCHAR(255) NULL,
  sale_id INT NULL UNIQUE,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sr_invoice FOREIGN KEY (sales_invoice_id) REFERENCES sales_invoices(id),
  CONSTRAINT fk_sr_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_sr_sale FOREIGN KEY (sale_id) REFERENCES sales(id),
  CONSTRAINT fk_sr_user FOREIGN KEY (created_by) REFERENCES users(id),
  KEY idx_sr_date (return_date)
) ENGINE=InnoDB;

CREATE TABLE sales_return_lines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sales_return_id INT NOT NULL,
  invoice_line_id INT NOT NULL,
  product_id INT NOT NULL,
  qty DECIMAL(12,3) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  reason TINYINT NOT NULL,
  CONSTRAINT fk_srl_return FOREIGN KEY (sales_return_id) REFERENCES sales_returns(id) ON DELETE CASCADE,
  CONSTRAINT fk_srl_invoice_line FOREIGN KEY (invoice_line_id) REFERENCES sales_invoice_lines(id),
  CONSTRAINT fk_srl_product FOREIGN KEY (product_id) REFERENCES bundle_products(id)
) ENGINE=InnoDB;
