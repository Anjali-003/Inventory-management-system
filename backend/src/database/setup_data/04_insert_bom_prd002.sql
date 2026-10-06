-- =====================================================================
-- 04_insert_bom_prd002.sql
-- BOM of PRD-002 (UTS SS-E-2950A Vr-2 New Combo PCB(1.4)) from the BOM sheet.
-- "Part No." = component name; the "1000" (stock) column on the sheet is ignored.
-- PCB location is NULL for every line for now (fill it in later).
--
-- RUN ORDER: migrations 009 + 010, 03_insert_bom_prd001.sql, then this file (from backend/src/database):
--   mysql --default-character-set=utf8mb4 -u <user> -p inventory_management < seeds/04_insert_bom_prd002.sql
--
-- 1) Parts that already exist (same name + size) are reused: 37 of 111 lines.
-- 2) The 74 parts that do not exist yet are added as CMP-0081..CMP-0154 (minimum stock 50, like the others),
--    each with an inventory row of 0 on hand (no ledger entry, so stock stays in sync).
-- 3) Lines with a blank quantity on the sheet (COATING, ADESIVE GLUE, OUTER BOX, SHOLDER) get NULL.
-- Stops with an error on a duplicate SKU if run twice.
-- =====================================================================

USE inventory_management;

INSERT INTO components
    (sku, name, description, unit, category, size, minimum_stock_level)
VALUES
('CMP-0081', '470E', NULL, 'pcs', 'RESISTANCE', '1206(1%)', 50),
('CMP-0082', '3K', NULL, 'pcs', 'RESISTANCE', '1206(1%)', 50),
('CMP-0083', '3.3K', NULL, 'pcs', 'RESISTANCE', '1206(1%)', 50),
('CMP-0084', '8K2', NULL, 'pcs', 'RESISTANCE', '1206(1%)', 50),
('CMP-0085', '10K', NULL, 'pcs', 'RESISTANCE', '1206(1%)', 50),
('CMP-0086', '18K', NULL, 'pcs', 'RESISTANCE', '1206(1%)', 50),
('CMP-0087', '56K', NULL, 'pcs', 'RESISTANCE', '1206(1%)', 50),
('CMP-0088', '75K', NULL, 'pcs', 'RESISTANCE', '1206(1%)', 50),
('CMP-0089', '220K', NULL, 'pcs', 'RESISTANCE', '1206(1%)', 50),
('CMP-0090', '0E', NULL, 'pcs', 'RESISTANCE', '1206(5%)', 50),
('CMP-0091', '10E', NULL, 'pcs', 'RESISTANCE', '1206(5%)', 50),
('CMP-0092', '68E', NULL, 'pcs', 'RESISTANCE', '1206(5%)', 50),
('CMP-0093', '4K7', NULL, 'pcs', 'RESISTANCE', '1206(5%)', 50),
('CMP-0094', '22K', NULL, 'pcs', 'RESISTANCE', '1206(5%)', 50),
('CMP-0095', '0.015E', NULL, 'pcs', 'RESISTANCE', '2512(SHUNT)', 50),
('CMP-0096', '4148', NULL, 'pcs', 'DIODE', 'SMT', 50),
('CMP-0097', 'BAT54S', NULL, 'pcs', 'DIODE', 'SMT', 50),
('CMP-0098', 'P6KE24CA TVS', NULL, 'pcs', 'DIODE', 'TH', 50),
('CMP-0099', 'P6KE5C TVS', NULL, 'pcs', 'DIODE', 'TH', 50),
('CMP-0100', '1N4007', NULL, 'pcs', 'DIODE', 'TH', 50),
('CMP-0101', 'MBRF20200CT', NULL, 'pcs', 'DIODE', 'TH', 50),
('CMP-0102', '5V(ZENER)', NULL, 'pcs', 'ZENER DIODE', 'SMT', 50),
('CMP-0103', '12V(ZENER)', NULL, 'pcs', 'ZENER DIODE', '(1W)TH', 50),
('CMP-0104', '6C(NPN)', NULL, 'pcs', 'TRANSISTOR', 'SMT', 50),
('CMP-0105', '3F(PNP)', NULL, 'pcs', 'TRANSISTOR', 'SMT', 50),
('CMP-0106', 'TL431', NULL, 'pcs', 'TRANSISTOR', 'SMT', 50),
('CMP-0107', '0E', NULL, 'pcs', 'RESISTANCE', '(1/4W)TH', 50),
('CMP-0108', '2K2', NULL, 'pcs', 'RESISTANCE', '(1/4W)TH', 50),
('CMP-0109', '10K', NULL, 'pcs', 'RESISTANCE', '(1/4W)TH', 50),
('CMP-0110', '220K', NULL, 'pcs', 'RESISTANCE', '(1/4W)TH 1%', 50),
('CMP-0111', '22E', NULL, 'pcs', 'RESISTANCE', '(2W)TH', 50),
('CMP-0112', '2K2', NULL, 'pcs', 'RESISTANCE', '(2W)TH', 50),
('CMP-0113', '0.33E', NULL, 'pcs', 'RESISTANCE', '(5W)TH', 50),
('CMP-0114', 'MB10F', NULL, 'pcs', 'BRIDGE', 'SMT', 50),
('CMP-0115', '1MFD', NULL, 'pcs', 'CAPACITORS', '1206', 50),
('CMP-0116', '10KPF', NULL, 'pcs', 'CAPACITORS', '1206', 50),
('CMP-0117', '22KPF', NULL, 'pcs', 'CAPACITORS', '1206', 50),
('CMP-0118', '100PF', NULL, 'pcs', 'CERAMIC CAPACITOR', '(1KV)TH', 50),
('CMP-0119', '1KPF', NULL, 'pcs', 'CERAMIC CAPACITOR', '(2KV)TH', 50),
('CMP-0120', '2K2PF/Y1', NULL, 'pcs', 'CERAMIC CAPACITOR', '(2KV)TH', 50),
('CMP-0121', '4.7UF/450V', NULL, 'pcs', 'ELCO', '(105°C)TH', 50),
('CMP-0122', '10UF/450V', NULL, 'pcs', 'ELCO', '(105°C)TH', 50),
('CMP-0123', '33UF/50V', NULL, 'pcs', 'ELCO', '(85°C)TH', 50),
('CMP-0124', '100UF/25V', NULL, 'pcs', 'ELCO', '(105°C)TH', 50),
('CMP-0125', '100UF/450V', NULL, 'pcs', 'ELCO', '(105°C)TH', 50),
('CMP-0126', '220UF/35V', NULL, 'pcs', 'ELCO', '(105°C)TH', 50),
('CMP-0127', '470UF/25V', NULL, 'pcs', 'ELCO', '(105°C)TH', 50),
('CMP-0128', '1000UF/35V', NULL, 'pcs', 'ELCO', '(105°C)TH', 50),
('CMP-0129', '0.22UF', NULL, 'pcs', 'POLY CAPACITOR', 'TH', 50),
('CMP-0130', '7A/24V', NULL, 'pcs', 'RELAY', 'TH', 50),
('CMP-0131', '5D-15/2.5D-15', NULL, 'pcs', 'NTC', 'TH', 50),
('CMP-0132', 'BI COLOR (RED,GREEN)', NULL, 'pcs', 'LED', 'TH(CC)', 50),
('CMP-0133', 'PQ-3535', NULL, 'pcs', 'TRANSFORMER', 'TH', 50),
('CMP-0134', 'COIL', NULL, 'pcs', 'INDUCTORS', '67uH', 50),
('CMP-0135', '358', NULL, 'pcs', 'SEMICONDUCTORS', 'IC(SMT)', 50),
('CMP-0136', '3845', NULL, 'pcs', 'SEMICONDUCTORS', 'IC(SMT)', 50),
('CMP-0137', 'MM32G0001A6T', NULL, 'pcs', 'SEMICONDUCTORS', 'IC(SMT)', 50),
('CMP-0138', 'BERGSTICK ST', NULL, 'pcs', 'BERGSTIK CONNECTOR', '3 PINS', 50),
('CMP-0139', 'BERGSTICK ST', NULL, 'pcs', 'BERGSTIK CONNECTOR', '4 PINS', 50),
('CMP-0140', 'HRP80N06K', NULL, 'pcs', 'MOSFET', 'MOSFET', 50),
('CMP-0141', 'HEATSHINK', NULL, 'pcs', 'MISC', '(25*50)MM', 50),
('CMP-0142', 'HEATSHINK', NULL, 'pcs', 'MISC', '(19*50)MM', 50),
('CMP-0143', 'DC LEAD (1.5MM)', NULL, 'pcs', 'MISC', '1.2 Mtr.', 50),
('CMP-0144', 'FUSE HOLDER', NULL, 'pcs', 'MISC', NULL, 50),
('CMP-0145', 'FUSE', NULL, 'pcs', 'MISC', '5 Amp', 50),
('CMP-0146', 'C 14 CONNECTOR', NULL, 'pcs', 'MISC', NULL, 50),
('CMP-0147', 'SS-E-2950A Vr-2', NULL, 'pcs', 'MISC', '(112*91)MM', 50),
('CMP-0148', 'HEATSHINK COMPOUND', NULL, 'pcs', 'MISC', NULL, 50),
('CMP-0149', 'CABINET', NULL, 'pcs', 'MISC', '(130*97*66)MM', 50),
('CMP-0150', 'SIDE PATI', NULL, 'pcs', 'MISC', 'FRONT AND BACK', 50),
('CMP-0151', 'PAINHEAD SCREW(BLACK)', NULL, 'pcs', 'MISC', '12*3MM', 50),
('CMP-0152', 'RED WIRE', NULL, 'pcs', 'MISC', '65MM*0.5MM', 50),
('CMP-0153', 'RED PAINT', NULL, 'pcs', 'MISC', NULL, 50),
('CMP-0154', 'self screw (black)', NULL, 'pcs', 'MISC', '(4*9.5) mm', 50);

INSERT INTO inventory (component_id, quantity_on_hand, quantity_reserved)
SELECT id, 0, 0 FROM components WHERE sku >= 'CMP-0081' ORDER BY id;

DELETE FROM product_bom WHERE product_id = (SELECT id FROM products WHERE sku = 'PRD-002');

INSERT INTO product_bom (product_id, component_id, quantity_required, location)
VALUES
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0081'), 1, NULL),  -- 470E 1206(1%)
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0004'), 8, NULL),  -- 1K 1206(1%)
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0005'), 7, NULL),  -- 2K2 1206(1%)
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0082'), 2, NULL),  -- 3K 1206(1%)
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0083'), 1, NULL),  -- 3.3K 1206(1%)
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0084'), 1, NULL),  -- 8K2 1206(1%)
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0085'), 3, NULL),  -- 10K 1206(1%)
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0086'), 1, NULL),  -- 18K 1206(1%)
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0009'), 1, NULL),  -- 47K 1206(1%)
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0087'), 1, NULL),  -- 56K 1206(1%)
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0088'), 1, NULL),  -- 75K 1206(1%)
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0010'), 8, NULL),  -- 100K 1206(1%)
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0089'), 3, NULL),  -- 220K 1206(1%)
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0090'), 2, NULL),  -- 0E 1206(5%)
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0091'), 2, NULL),  -- 10E 1206(5%)
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0092'), 1, NULL),  -- 68E 1206(5%)
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0093'), 2, NULL),  -- 4K7 1206(5%)
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0094'), 3, NULL),  -- 22K 1206(5%)
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0095'), 1, NULL),  -- 0.015E 2512(SHUNT)
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0018'), 4, NULL),  -- M7 SMT
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0019'), 3, NULL),  -- US3M SMT
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0096'), 4, NULL),  -- 4148 SMT
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0097'), 2, NULL),  -- BAT54S SMT
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0098'), 1, NULL),  -- P6KE24CA TVS TH
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0099'), 1, NULL),  -- P6KE5C TVS TH
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0100'), 1, NULL),  -- 1N4007 TH
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0028'), 1, NULL),  -- UF5408 TH
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0101'), 1, NULL),  -- MBRF20200CT TH
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0102'), 1, NULL),  -- 5V(ZENER) SMT
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0103'), 2, NULL),  -- 12V(ZENER) (1W)TH
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0104'), 2, NULL),  -- 6C(NPN) SMT
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0105'), 2, NULL),  -- 3F(PNP) SMT
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0106'), 3, NULL),  -- TL431 SMT
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0026'), 2, NULL),  -- EL817C SMT
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0107'), 1, NULL),  -- 0E (1/4W)TH
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0032'), 2, NULL),  -- 1K (1/4W)TH
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0108'), 1, NULL),  -- 2K2 (1/4W)TH
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0109'), 2, NULL),  -- 10K (1/4W)TH
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0110'), 2, NULL),  -- 220K (1/4W)TH 1%
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0111'), 1, NULL),  -- 22E (2W)TH
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0112'), 1, NULL),  -- 2K2 (2W)TH
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0034'), 1, NULL),  -- 39K (2W)TH
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0113'), 1, NULL),  -- 0.33E (5W)TH
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0114'), 1, NULL),  -- MB10F SMT
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0030'), 1, NULL),  -- GBU 810 BRIDGE
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0115'), 2, NULL),  -- 1MFD 1206
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0013'), 4, NULL),  -- 1KPF 1206
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0014'), 1, NULL),  -- 4K7PF 1206
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0116'), 1, NULL),  -- 10KPF 1206
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0117'), 1, NULL),  -- 22KPF 1206
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0016'), 8, NULL),  -- 100KPF 1206
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0118'), 1, NULL),  -- 100PF (1KV)TH
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0119'), 2, NULL),  -- 1KPF (2KV)TH
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0120'), 1, NULL),  -- 2K2PF/Y1 (2KV)TH
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0121'), 2, NULL),  -- 4.7UF/450V (105°C)TH
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0122'), 1, NULL),  -- 10UF/450V (105°C)TH
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0123'), 1, NULL),  -- 33UF/50V (85°C)TH
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0124'), 2, NULL),  -- 100UF/25V (105°C)TH
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0125'), 1, NULL),  -- 100UF/450V (105°C)TH
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0126'), 1, NULL),  -- 220UF/35V (105°C)TH
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0127'), 1, NULL),  -- 470UF/25V (105°C)TH
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0128'), 1, NULL),  -- 1000UF/35V (105°C)TH
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0043'), 2, NULL),  -- 100KPF/310V TH
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0129'), 1, NULL),  -- 0.22UF TH
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0130'), 1, NULL),  -- 7A/24V TH
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0131'), 1, NULL),  -- 5D-15/2.5D-15 TH
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0045'), 1, NULL),  -- 20D511K TH
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0132'), 1, NULL),  -- BI COLOR (RED,GREEN) TH(CC)
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0133'), 1, NULL),  -- PQ-3535 TH
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0047'), 1, NULL),  -- LINE FILTER 6.9mH,6.9mH
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0134'), 1, NULL),  -- COIL 67uH
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0135'), 1, NULL),  -- 358 IC(SMT)
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0136'), 1, NULL),  -- 3845 IC(SMT)
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0137'), 1, NULL),  -- MM32G0001A6T IC(SMT)
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0138'), 1, NULL),  -- BERGSTICK ST 3 PINS
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0139'), 1, NULL),  -- BERGSTICK ST 4 PINS
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0048'), 1, NULL),  -- 2 PIN CONNECTOR (ST)2515
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0049'), 1, NULL),  -- 24N60 MOSFET
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0140'), 2, NULL),  -- HRP80N06K MOSFET
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0141'), 1, NULL),  -- HEATSHINK (25*50)MM
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0142'), 1, NULL),  -- HEATSHINK (19*50)MM
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0143'), 1, NULL),  -- DC LEAD (1.5MM) 1.2 Mtr.
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0053'), 1, NULL),  -- AC LEAD (0.75 MM) 2.1 Mtr.
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0054'), 2, NULL),  -- GURMUT PG9
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0144'), 1, NULL),  -- FUSE HOLDER
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0145'), 1, NULL),  -- FUSE 5 Amp
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0146'), 1, NULL),  -- C 14 CONNECTOR
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0147'), 1, NULL),  -- SS-E-2950A Vr-2 (112*91)MM
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0057'), 7, NULL),  -- CERAMIC BEAT 4MM
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0058'), 1, NULL),  -- THERMAL PAD GREY (TC-20TAG-2)
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0148'), 1, NULL),  -- HEATSHINK COMPOUND
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0149'), 1, NULL),  -- CABINET (130*97*66)MM
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0061'), 1, NULL),  -- FAN 60*60*15 MM
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0150'), 2, NULL),  -- SIDE PATI FRONT AND BACK
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0062'), NULL, NULL),  -- COATING
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0151'), 4, NULL),  -- PAINHEAD SCREW(BLACK) 12*3MM
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0152'), 1, NULL),  -- RED WIRE 65MM*0.5MM
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0064'), 5, NULL),  -- STICKER
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0065'), NULL, NULL),  -- ADESIVE GLUE
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0153'), 4, NULL),  -- RED PAINT
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0066'), 1, NULL),  -- EP SHEET 1 SET
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0067'), 1, NULL),  -- INNER BOX
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0068'), NULL, NULL),  -- OUTER BOX
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0069'), 1, NULL),  -- CABLE TYE 100MM
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0070'), NULL, NULL),  -- SHOLDER
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0071'), 1, NULL),  -- INSULATION SHEET (130*95)MM
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0072'), 1, NULL),  -- EARTHING WIRE 14*36 (55mm)
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0073'), 1, NULL),  -- GLASS SLEEVE (1*15)MM
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0074'), 4, NULL),  -- Fan Screw(black) 10*13
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0154'), 8, NULL),  -- self screw (black) (4*9.5) mm
((SELECT id FROM products WHERE sku = 'PRD-002'), (SELECT id FROM components WHERE sku = 'CMP-0078'), 3, NULL);  -- Jumper wire

-- Check (expect: 111 BOM rows for PRD-002, 154 components, 154 inventory rows)
SELECT (SELECT COUNT(*) FROM product_bom WHERE product_id = (SELECT id FROM products WHERE sku = 'PRD-002')) AS prd002_bom_rows,
       (SELECT COUNT(*) FROM components) AS components,
       (SELECT COUNT(*) FROM inventory)  AS inventory_rows;
