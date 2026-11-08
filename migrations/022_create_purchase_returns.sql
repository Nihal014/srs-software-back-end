-- Goods sent back to a supplier after they were received and accepted into stock.
-- A return is raised against one GRN. Posting it removes the returned quantity from each batch
-- (through batch_adjustments, so the batch history explains it) and records what the supplier
-- now owes as credit: total_amount = sum of qty x the PO line rate the goods were bought at.
-- credit_status: 1 = Credit pending, 2 = Credit received (refund, or set against a later bill).
-- reason is numeric like the other code fields - see PURCHASE_RETURN_REASON in purchase-return.interface.ts.
CREATE TABLE purchase_returns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  return_number VARCHAR(30) NOT NULL UNIQUE,
  grn_id INT NOT NULL,
  supplier_id INT NOT NULL,
  return_date DATE NOT NULL,
  total_amount DECIMAL(14,2) NOT NULL,
  credit_status TINYINT NOT NULL DEFAULT 1,
  credit_received_date DATE NULL,
  remarks VARCHAR(255) NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pret_grn FOREIGN KEY (grn_id) REFERENCES grns(id),
  CONSTRAINT fk_pret_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  CONSTRAINT fk_pret_user FOREIGN KEY (created_by) REFERENCES users(id),
  KEY idx_pret_date (return_date),
  KEY idx_pret_grn (grn_id)
) ENGINE=InnoDB;

CREATE TABLE purchase_return_lines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  purchase_return_id INT NOT NULL,
  batch_id INT NOT NULL,
  item_id INT NOT NULL,
  qty DECIMAL(12,3) NOT NULL,
  rate DECIMAL(12,2) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  reason TINYINT NOT NULL,
  remarks VARCHAR(250) NULL,
  CONSTRAINT fk_prl_return FOREIGN KEY (purchase_return_id) REFERENCES purchase_returns(id) ON DELETE CASCADE,
  CONSTRAINT fk_prl_batch FOREIGN KEY (batch_id) REFERENCES batches(id),
  CONSTRAINT fk_prl_item FOREIGN KEY (item_id) REFERENCES items(id)
) ENGINE=InnoDB;
