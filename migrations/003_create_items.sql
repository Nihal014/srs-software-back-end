-- Only `rate` and `reorder_level` are authored/maintained directly on the item.
-- `rate` is the current weighted-average purchase rate — recalculated every time
-- a GRN is posted for this item (see grn.service.ts), never overwritten flatly.
CREATE TABLE items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  rate DECIMAL(12,2) NOT NULL DEFAULT 0,
  reorder_level DECIMAL(12,3) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
