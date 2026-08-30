INSERT INTO suppliers (name, contact_person, phone, email, gstin, payment_terms) VALUES
('Al Ameen Poultry, Kollam', 'Aslam K.', '9895512345', 'aslam@alameenpoultry.example', '32ABCRS1234K1Z1', 'Net 15 days'),
('Chinnakada Vegetable Mandi', 'Sunil P.', '9847098470', 'sunil@chinnakadamandi.example', '32ABCRS1235K1Z2', 'Cash on delivery');

INSERT INTO items (code, name, unit, rate, reorder_level) VALUES
('RM-001', 'Chicken, broiler cleaned', 'kg', 198.00, 15),
('RM-002', 'Onion, big', 'kg', 38.00, 15),
('RM-003', 'Ginger', 'kg', 172.00, 4),
('RM-004', 'Green chilli', 'kg', 96.00, 3),
('PK-001', 'Meal box, 750 ml', 'pcs', 9.50, 60);
