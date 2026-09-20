-- Accounts / Ledger, modelled on the client's account workbook.
--
-- expense_categories.pl_group decides where a category lands in the P&L:
--   1 = Direct cost (salary, raw materials, KSEB, LPG, packing, transport, cold storage)
--   2 = Other expense (rent, fuel, maintenance, fees ...)
--   3 = Capital (assets, factory setup) — tracked, but kept out of profit
CREATE TABLE expense_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  pl_group TINYINT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Where money sits or comes from: 1 = Bank, 2 = Cash, 3 = Partner (paid personally).
-- Balance = opening_balance + receipts - expenses, computed, never stored.
CREATE TABLE accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  account_type TINYINT NOT NULL,
  opening_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- bill_status: 1 = Bill available, 2 = Payment receipt (e.g. GPay), 3 = Not available.
-- `amount` is the total paid; qty is informational (unit rate = amount / qty).
CREATE TABLE expenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  expense_date DATE NOT NULL,
  description VARCHAR(255) NOT NULL,
  category_id INT NOT NULL,
  qty DECIMAL(12,3) NOT NULL DEFAULT 1,
  amount DECIMAL(14,2) NOT NULL,
  account_id INT NOT NULL,
  bill_status TINYINT NOT NULL DEFAULT 1,
  remarks VARCHAR(255) NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_expense_category FOREIGN KEY (category_id) REFERENCES expense_categories(id),
  CONSTRAINT fk_expense_account FOREIGN KEY (account_id) REFERENCES accounts(id),
  CONSTRAINT fk_expense_user FOREIGN KEY (created_by) REFERENCES users(id),
  KEY idx_expense_date (expense_date),
  KEY idx_expense_category (category_id),
  KEY idx_expense_account (account_id)
) ENGINE=InnoDB;

-- Money coming in. source: 1 = Capital investment, 2 = Payment from a customer (reduces
-- what is receivable), 3 = Cash deposit / transfer between accounts, 4 = Other.
CREATE TABLE receipts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  receipt_date DATE NOT NULL,
  source TINYINT NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  account_id INT NOT NULL,
  remarks VARCHAR(255) NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_receipt_account FOREIGN KEY (account_id) REFERENCES accounts(id),
  CONSTRAINT fk_receipt_user FOREIGN KEY (created_by) REFERENCES users(id),
  KEY idx_receipt_date (receipt_date)
) ENGINE=InnoDB;

-- A simple sales register (the workbook only tracks sales in totals). What is still
-- receivable = total sales - receipts with source 2.
CREATE TABLE sales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sale_date DATE NOT NULL,
  customer VARCHAR(150) NULL,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  remarks VARCHAR(255) NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sale_user FOREIGN KEY (created_by) REFERENCES users(id),
  KEY idx_sale_date (sale_date)
) ENGINE=InnoDB;

-- "Ready products": finished goods not yet sold, valued at sales value, counted in the
-- gross margin exactly as the client's P&L does. The latest snapshot on or before the
-- report's end date is used.
CREATE TABLE ready_products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  as_of_date DATE NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  remarks VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ready_date (as_of_date)
) ENGINE=InnoDB;

INSERT INTO expense_categories (name, pl_group) VALUES
  ('Raw materials', 1), ('Salary', 1), ('Electricity & water (KSEB)', 1), ('LPG', 1),
  ('Packing', 1), ('Transportation', 1), ('Cold storage', 1),
  ('Rent', 2), ('Fuel & generator diesel', 2), ('Maintenance', 2), ('Medical', 2),
  ('Accountant fee', 2), ('Tax & renewal fees', 2), ('Cleaning & waste management', 2),
  ('Gift', 2), ('Labour charge', 2), ('Miscellaneous', 2),
  ('Asset', 3), ('Factory setup', 3);

INSERT INTO accounts (name, account_type) VALUES
  ('RSR account', 1), ('Cash on hand', 2), ('Raees', 3), ('Ramshy', 3);
