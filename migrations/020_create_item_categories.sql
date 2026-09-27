-- Item categories are managed by the client under Master Data (nothing is seeded). An item's
-- category is optional, so items created before this migration simply stay uncategorised.
-- `code` is a short optional tag such as ING or PKG.
CREATE TABLE item_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  code VARCHAR(10) NULL UNIQUE,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

ALTER TABLE items
  ADD COLUMN category_id INT NULL AFTER unit,
  ADD CONSTRAINT fk_item_category FOREIGN KEY (category_id) REFERENCES item_categories(id);
