-- role is numeric, matching the PO_STATUS convention: 1 = Admin, 2 = Staff.
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(150) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role TINYINT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Seed accounts. Passwords (change after first login):
--   admin@rsrbakes.com / Admin@RSR2026!
--   staff@rsrbakes.com / Staff@RSR2026!
INSERT INTO users (email, name, password_hash, role) VALUES
('admin@rsrbakes.com', 'Raees A.', '$2b$12$TcS1FTiKbBYidLMKRgJaQePwxD20hjR1FukUfsOiVaCvEBNEJsWwa', 1),
('staff@rsrbakes.com', 'Staff User', '$2b$12$DninoPe8uz.L86qknFo3S.vgAq5bSkuPQ6eJXjafNFfA.8VJVpMR6', 2);
