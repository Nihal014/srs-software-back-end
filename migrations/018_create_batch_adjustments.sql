-- Manual corrections to a batch's stock that aren't a receipt or a production use: expiry
-- write-offs, damage/spoilage, a stock-count correction, or anything else. `qty` is signed
-- (negative = stock removed, positive = stock found) and is added to batches.qty_adjusted, so
-- available stock stays the single formula qty_received - qty_consumed + qty_adjusted. reason
-- is numeric like the other code fields — see BATCH_ADJUSTMENT_REASON in batch.interface.ts.
-- Rows are never edited or deleted: this table is the adjustment history for a batch.
CREATE TABLE batch_adjustments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  batch_id INT NOT NULL,
  qty DECIMAL(12,3) NOT NULL,
  reason TINYINT NOT NULL,
  remarks VARCHAR(250) NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_batch_adj_batch FOREIGN KEY (batch_id) REFERENCES batches(id),
  CONSTRAINT fk_batch_adj_user FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;
