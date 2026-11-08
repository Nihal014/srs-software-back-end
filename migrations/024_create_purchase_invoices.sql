-- A supplier's bill for goods received, raised against one GRN, and the payments made against it.
-- amount is what the supplier billed (it can differ from the GRN value - the screen shows the gap).
-- The paid / outstanding figures and the Unpaid / Part paid / Paid status are always derived from the
-- payments, never stored. Each payment also writes an expense (expense_id) so the Cash Book and the
-- Profit & Loss stay right without anyone entering the same money twice.
CREATE TABLE purchase_invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_number VARCHAR(30) NOT NULL UNIQUE,
  supplier_invoice_no VARCHAR(60) NOT NULL,
  grn_id INT NOT NULL,
  supplier_id INT NOT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  remarks VARCHAR(255) NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pinv_grn FOREIGN KEY (grn_id) REFERENCES grns(id),
  CONSTRAINT fk_pinv_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  CONSTRAINT fk_pinv_user FOREIGN KEY (created_by) REFERENCES users(id),
  UNIQUE KEY uq_pinv_supplier_no (supplier_id, supplier_invoice_no),
  KEY idx_pinv_due (due_date),
  KEY idx_pinv_grn (grn_id)
) ENGINE=InnoDB;

CREATE TABLE purchase_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  purchase_invoice_id INT NOT NULL,
  payment_date DATE NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  account_id INT NOT NULL,
  expense_id INT NOT NULL,
  reference VARCHAR(100) NULL,
  remarks VARCHAR(255) NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ppay_invoice FOREIGN KEY (purchase_invoice_id) REFERENCES purchase_invoices(id),
  CONSTRAINT fk_ppay_account FOREIGN KEY (account_id) REFERENCES accounts(id),
  CONSTRAINT fk_ppay_expense FOREIGN KEY (expense_id) REFERENCES expenses(id),
  CONSTRAINT fk_ppay_user FOREIGN KEY (created_by) REFERENCES users(id),
  KEY idx_ppay_invoice (purchase_invoice_id)
) ENGINE=InnoDB;
