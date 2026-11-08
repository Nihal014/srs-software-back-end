-- The business's own details. For now this holds the legal name and GSTIN, which the GST reports need:
-- the first two digits of a GSTIN are the state code, and a sale to a customer in another state is
-- taxed as IGST instead of CGST + SGST. Always exactly one row (id = 1).
CREATE TABLE company_settings (
  id TINYINT PRIMARY KEY,
  legal_name VARCHAR(150) NOT NULL,
  gstin VARCHAR(20) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO company_settings (id, legal_name) VALUES (1, 'RSR BAKES');
