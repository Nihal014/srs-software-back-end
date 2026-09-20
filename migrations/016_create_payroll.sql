-- Staff paid per the client's real process: most are paid hours x hourly rate
-- (e.g. Rs 55/hr), a few a flat daily amount (e.g. Rs 750/day). pay_type is
-- numeric like the other codes: 1 = Hourly, 2 = Daily.
CREATE TABLE staff (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(30) NULL,
  pay_type TINYINT NOT NULL,
  pay_rate DECIMAL(10,2) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- One row per staff member per worked day. `amount` is what was earned that
-- day, stored at entry time so a later change to the staff member's rate never
-- rewrites history (same snapshot idea as bundle_consumptions.rate_at_time).
CREATE TABLE attendance_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  work_date DATE NOT NULL,
  hours DECIMAL(5,2) NULL,
  amount DECIMAL(10,2) NOT NULL,
  remarks VARCHAR(255) NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_attendance_staff FOREIGN KEY (staff_id) REFERENCES staff(id),
  CONSTRAINT fk_attendance_user FOREIGN KEY (created_by) REFERENCES users(id),
  UNIQUE KEY uq_attendance_staff_day (staff_id, work_date),
  KEY idx_attendance_date (work_date)
) ENGINE=InnoDB;
