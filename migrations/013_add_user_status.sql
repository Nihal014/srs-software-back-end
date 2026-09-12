-- Self-signup support: new accounts land as Pending and can't log in until an
-- Admin approves them. status is numeric, matching PO_STATUS/USER_ROLE
-- convention: 1 = Pending, 2 = Approved, 3 = Rejected.
ALTER TABLE users ADD COLUMN status TINYINT NOT NULL DEFAULT 1 AFTER role;

-- The two seeded accounts already exist and should be able to log in immediately.
UPDATE users SET status = 2;
