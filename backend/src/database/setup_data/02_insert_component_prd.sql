-- =====================================================================
-- insert_components.sql
-- Loads the fresh data set: 2 products, 80 components, and 1000 pcs of stock
-- for every component (with a matching ledger entry for each).
--
-- RUN ORDER:
--   1) reset_inventory.sql      (empties ledger, stock, orders, BOM, components)
--   2) insert_components.sql    (this file)
--
--   mysql --default-character-set=utf8mb4 -u <user> -p inventory_management < insert_components.sql
--
-- The client character set keeps symbols such as the degree sign in "105°C".
--
-- If the tables are not empty yet, the first DELETE (or a duplicate SKU)
-- fails and the script stops before inserting anything it should not.
--
-- NOT included on purpose:
--   * BOM rows (product_bom). The BOM you gave refers to the old demo
--     components (ids 1..18). Those ids are now different parts, so inserting
--     it would link the products to the wrong components. Add the real BOM
--     once it is defined for the new components.
--   * Admin user and employees: reset_inventory.sql does not touch them.
-- =====================================================================

USE inventory_management;

-- ---------------------------------------------------------------------
-- 1) Reset products (needs product_bom and order_items to be empty already)
-- ---------------------------------------------------------------------
DELETE FROM products;
ALTER TABLE products AUTO_INCREMENT = 1;

-- ---------------------------------------------------------------------
-- 2) Products
-- ---------------------------------------------------------------------
INSERT INTO products (sku, name, description)
VALUES
('PRD-001', 'SS-E-7560P Vr-1.1', NULL),
('PRD-002', 'UTS SS-E-2950A Vr-2 New Combo PCB(1.4)', NULL);

-- ---------------------------------------------------------------------
-- 3) Components
-- ---------------------------------------------------------------------
INSERT INTO components
    (sku, name, description, unit, category, size, minimum_stock_level)
VALUES
('CMP-0001', '0E', NULL, 'pcs', 'RESISTANCE', '1206(1%)', 50),
('CMP-0002', '4.7E', NULL, 'pcs', 'RESISTANCE', '1206(1%)', 50),
('CMP-0003', '10E', NULL, 'pcs', 'RESISTANCE', '1206(1%)', 50),
('CMP-0004', '1K', NULL, 'pcs', 'RESISTANCE', '1206(1%)', 50),
('CMP-0005', '2K2', NULL, 'pcs', 'RESISTANCE', '1206(1%)', 50),
('CMP-0006', '4K7', NULL, 'pcs', 'RESISTANCE', '1206(1%)', 50),
('CMP-0007', '15K', NULL, 'pcs', 'RESISTANCE', '1206(1%)', 50),
('CMP-0008', '22K', NULL, 'pcs', 'RESISTANCE', '1206(1%)', 50),
('CMP-0009', '47K', NULL, 'pcs', 'RESISTANCE', '1206(1%)', 50),
('CMP-0010', '100K', NULL, 'pcs', 'RESISTANCE', '1206(1%)', 50),

('CMP-0011', '4K7', NULL, 'pcs', 'RESISTANCE', '2512', 50),
('CMP-0012', '10K', NULL, 'pcs', 'RESISTANCE', '2512', 50),
('CMP-0013', '1KPF', NULL, 'pcs', 'CAPACITORS', '1206', 50),
('CMP-0014', '4K7PF', NULL, 'pcs', 'CAPACITORS', '1206', 50),
('CMP-0015', '6K8PF', NULL, 'pcs', 'CAPACITORS', '1206', 50),
('CMP-0016', '100KPF', NULL, 'pcs', 'CAPACITORS', '1206', 50),
('CMP-0017', 'SHUNT (10ME)', NULL, 'pcs', 'SHUNT', '2512', 50),
('CMP-0018', 'M7', NULL, 'pcs', 'DIODE', 'SMT', 50),
('CMP-0019', 'US3M', NULL, 'pcs', 'DIODE', 'SMT', 50),
('CMP-0020', '5.1V BZT52C-5V1', NULL, 'pcs', 'ZENER DIODE', 'SMT', 50),

('CMP-0021', '12V(ZENER)', NULL, 'pcs', 'ZENER DIODE', 'SMT', 50),
('CMP-0022', '3.6V(ZENER)', NULL, 'pcs', 'ZENER DIODE', 'SMT', 50),
('CMP-0023', 'BC817-40 (6C)', NULL, 'pcs', 'TRANSISTOR', 'SMT', 50),
('CMP-0024', 'PMBT5401 (2L)', NULL, 'pcs', 'TRANSISTOR', 'SMT', 50),
('CMP-0025', 'PMBT5551 (G1)', NULL, 'pcs', 'TRANSISTOR', 'SMT', 50),
('CMP-0026', 'EL817C', NULL, 'pcs', 'OPTO COUPLER', 'SMT', 50),
('CMP-0027', 'UC3845-G', NULL, 'pcs', 'SEMICONDUCTORS', 'IC(SMT)', 50),
('CMP-0028', 'UF5408', NULL, 'pcs', 'DIODE', 'TH', 50),
('CMP-0029', 'MUR3060PT', NULL, 'pcs', 'DIODE', 'TH', 50),
('CMP-0030', 'GBU 810', NULL, 'pcs', 'DIODE', 'BRIDGE DIODE', 50),

('CMP-0031', '7812 (TO220)', NULL, 'pcs', 'VOLTAGE REGULATOR', 'TH', 50),
('CMP-0032', '1K', NULL, 'pcs', 'RESISTANCE', '(1/4W)TH', 50),
('CMP-0033', '4.7E', NULL, 'pcs', 'RESISTANCE', '(2W)TH', 50),
('CMP-0034', '39K', NULL, 'pcs', 'RESISTANCE', '(2W)TH', 50),
('CMP-0035', '0.1E (WIRE BOND)', NULL, 'pcs', 'RESISTANCE', '(2W)TH', 50),
('CMP-0036', '1KPF', NULL, 'pcs', 'CERAMIC CAPACITOR', '(1KV)TH', 50),
('CMP-0037', '10KPF', NULL, 'pcs', 'CERAMIC CAPACITOR', '(2KV)TH', 50),
('CMP-0038', '2K2PF 400V AC', NULL, 'pcs', 'CERAMIC CAPACITOR', '(2KV)TH', 50),
('CMP-0039', '1UF/63V', NULL, 'pcs', NULL, '(105°C)TH', 50),
('CMP-0040', '100UF/150V', NULL, 'pcs', 'ELCO', '(105°C)TH', 50),

('CMP-0041', '220UF/450V', NULL, 'pcs', 'ELCO', '(105°C)TH', 50),
('CMP-0042', '470UF/35V', NULL, 'pcs', 'ELCO', '(105°C)TH', 50),
('CMP-0043', '100KPF/310V', NULL, 'pcs', 'BOX CAPACITOR', 'TH', 50),
('CMP-0044', '5D-10', NULL, 'pcs', 'NTC', 'TH', 50),
('CMP-0045', '20D511K', NULL, 'pcs', 'MOV', 'TH', 50),
('CMP-0046', 'PQ-4040 VERTICAL', NULL, 'pcs', 'TRANSFORMER', 'TH', 50),
('CMP-0047', 'LINE FILTER', NULL, 'pcs', 'INDUCTORS', '6.9mH,6.9mH', 50),
('CMP-0048', '2 PIN CONNECTOR', NULL, 'pcs', 'FAN CONNECTOR', '(ST)2515', 50),
('CMP-0049', '24N60', NULL, 'pcs', 'MOSFET', 'MOSFET', 50),
('CMP-0050', 'IRF4648', NULL, 'pcs', 'MOSFET', 'MOSFET', 50),

('CMP-0051', 'HEATSHINK', NULL, 'pcs', 'MISC', '(75*45)MM', 50),
('CMP-0052', 'DC LEAD (1.MM)', NULL, 'pcs', 'MISC', '1.2 Mtr.', 50),
('CMP-0053', 'AC LEAD (0.75 MM)', NULL, 'pcs', 'MISC', '2.1 Mtr.', 50),
('CMP-0054', 'GURMUT', NULL, 'pcs', 'MISC', 'PG9', 50),
('CMP-0055', 'FUSE', NULL, 'pcs', 'MISC', '5AMP (SLOW FLOW)', 50),
('CMP-0056', 'SS-E-7560I', NULL, 'pcs', 'MISC', '(110*90)MM', 50),
('CMP-0057', 'CERAMIC BEAT', NULL, 'pcs', 'MISC', '4MM', 50),
('CMP-0058', 'THERMAL PAD', NULL, 'pcs', 'MISC', 'GREY (TC-20TAG-2)', 50),
('CMP-0059', 'CABINET', NULL, 'pcs', 'MISC', '(130*97*65)MM', 50),
('CMP-0060', 'SIDE PLATE (PLASTIC)', NULL, 'pcs', 'MISC', 'FRONT AND BACK', 50),

('CMP-0061', 'FAN', NULL, 'pcs', 'MISC', '60*60*15 MM', 50),
('CMP-0062', 'COATING', NULL, 'pcs', 'MISC', NULL, 50),
('CMP-0063', 'PAINHEAD SCREW(BLACK)', NULL, 'pcs', 'MISC', '15*3MM', 50),
('CMP-0064', 'STICKER', NULL, 'pcs', 'MISC', NULL, 50),
('CMP-0065', 'ADESIVE GLUE', NULL, 'pcs', 'MISC', NULL, 50),
('CMP-0066', 'EP SHEET', NULL, 'pcs', 'MISC', '1 SET', 50),
('CMP-0067', 'INNER BOX', NULL, 'pcs', 'MISC', NULL, 50),
('CMP-0068', 'OUTER BOX', NULL, 'pcs', 'MISC', NULL, 50),
('CMP-0069', 'CABLE TYE', NULL, 'pcs', 'MISC', '100MM', 50),
('CMP-0070', 'SHOLDER', NULL, 'pcs', 'MISC', NULL, 50),

('CMP-0071', 'INSULATION SHEET', NULL, 'pcs', 'MISC', '(130*95)MM', 50),
('CMP-0072', 'EARTHING WIRE', NULL, 'pcs', 'MISC', '14*36 (55mm)', 50),
('CMP-0073', 'GLASS SLEEVE', NULL, 'pcs', 'MISC', '(1*15)MM', 50),
('CMP-0074', 'Fan Screw(black)', NULL, 'pcs', 'MISC', '10*13', 50),
('CMP-0075', 'Self screw (SILVER)', NULL, 'pcs', 'MISC', '(4*9.5) mm', 50),
('CMP-0076', '10K (NTC)', NULL, 'pcs', 'MISC', 'Temprature Sensor', 50),
('CMP-0077', 'Spring Washer', NULL, 'pcs', 'MISC', '3mm', 50),
('CMP-0078', 'Jumper wire', NULL, 'pcs', 'MISC', NULL, 50),
('CMP-0079', 'CPU CONNECTOR (5083 3M)', NULL, 'pcs', 'MISC', '5083', 50),
('CMP-0080', 'A TAG (SMALL)', NULL, 'pcs', 'MISC', 'TH (MALE)', 50);

-- ---------------------------------------------------------------------
-- 4) Inventory: one row per component with 1000 on hand.
-- ---------------------------------------------------------------------
INSERT INTO inventory (component_id, quantity_on_hand, quantity_reserved)
SELECT id, 1000, 0 FROM components ORDER BY id;

-- 5) Ledger: one STOCK_IN entry per component for those 1000 pcs.
--    Stock only ever changes together with a ledger row, so ledger and stock
--    agree (the Stock page's sync check stays green) and Inventory History
--    counts it as received: 80 x 1000 = 80,000.
INSERT INTO inventory_transactions
    (component_id, transaction_type, direction, quantity, balance_after, reason, created_by)
SELECT c.id, 'STOCK_IN', 'IN', 1000, 1000, 'Initial stock', (SELECT MIN(id) FROM users)
FROM components c
ORDER BY c.id;

-- ---------------------------------------------------------------------
-- Check (expect: 2 products, 80 components, 80 inventory rows, 80 ledger rows,
--        80000 on hand, 80000 in the ledger, 0 BOM rows)
-- ---------------------------------------------------------------------
SELECT (SELECT COUNT(*) FROM products)                         AS products,
       (SELECT COUNT(*) FROM components)                       AS components,
       (SELECT COUNT(*) FROM inventory)                        AS inventory_rows,
       (SELECT COUNT(*) FROM inventory_transactions)           AS ledger_rows,
       (SELECT SUM(quantity_on_hand) FROM inventory)           AS total_on_hand,
       (SELECT SUM(quantity) FROM inventory_transactions)      AS ledger_total_in,
       (SELECT COUNT(*) FROM product_bom)                      AS bom_rows;
