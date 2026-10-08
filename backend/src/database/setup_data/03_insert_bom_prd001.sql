-- =====================================================================
-- 03_insert_bom_prd001.sql
-- BOM of PRD-001 (SS-E-7560P Vr-1.1), from the sheet "SS-E-7560P BOM Vr-1.1 (08/05/2026)".
-- "Part No." on the sheet = component name. "Location" = where it sits on the PCB.
--
-- RUN ORDER: migrations 009 + 010 (product_bom.location, nullable quantity), then this file:
--   (migrations first: node src/database/migrate.js from backend/)
--   mysql --default-character-set=utf8mb4 -u <user> -p inventory_management < seeds/03_insert_bom_prd001.sql
--
-- Components are matched by SKU (CMP-0001..CMP-0080 from 02_insert_components.sql).
-- Sheet rows 1-58 -> CMP-0001..0058, rows 60-81 -> CMP-0059..0080 (the sheet has no row 59).
--
-- Blank / decimal quantities set to 1 (sheet had them blank or 0.1):
--   COATING (CMP-0062), ADESIVE GLUE (CMP-0065), SHOLDER (CMP-0070) were blank; OUTER BOX (CMP-0068) was 0.1
-- =====================================================================

USE inventory_management;

DELETE FROM product_bom WHERE product_id = (SELECT id FROM products WHERE sku = 'PRD-001');

INSERT INTO product_bom (product_id, component_id, quantity_required, location)
VALUES
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0001'), 4, 'R4, R7, R12, R22'),  -- 0E
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0002'), 2, 'R11, R25'),  -- 4.7E
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0003'), 1, 'R2'),  -- 10E
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0004'), 3, 'R10, R19, R28'),  -- 1K
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0005'), 3, 'R8, R9, R20, R18'),  -- 2K2
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0006'), 3, 'R15, R18, R30'),  -- 4K7
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0007'), 1, 'R31, R13'),  -- 15K
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0008'), 1, 'R5'),  -- 22K
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0009'), 2, 'R16, R26'),  -- 47K
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0010'), 5, 'R3, R29, R32, R33, R34'),  -- 100K
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0011'), 1, 'D7'),  -- 4K7
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0012'), 2, 'R14, R17'),  -- 10K
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0013'), 1, 'C16'),  -- 1KPF
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0014'), 2, 'C15'),  -- 4K7PF
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0015'), 1, 'C13'),  -- 6K8PF
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0016'), 2, 'C3, C11'),  -- 100KPF
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0017'), 1, 'R24'),  -- SHUNT (10ME)
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0018'), 1, 'D4'),  -- M7
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0019'), 1, 'D1'),  -- US3M
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0020'), 1, 'ZD1'),  -- 5.1V BZT52C-5V1
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0021'), 1, 'ZD1'),  -- 12V(ZENER)
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0022'), 1, 'D6'),  -- 3.6V(ZENER)
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0023'), 2, 'Q6, Q7'),  -- BC817-40 (6C)
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0024'), 1, 'Q4'),  -- PMBT5401 (2L)
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0025'), 1, 'Q2'),  -- PMBT5551 (G1)
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0026'), 1, 'U4'),  -- EL817C
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0027'), 1, 'U3'),  -- UC3845-G
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0028'), 2, 'D2, D8'),  -- UF5408
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0029'), 1, 'D5'),  -- MUR3060PT
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0030'), 1, 'BR1'),  -- GBU 810
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0031'), 1, 'Q3'),  -- 7812 (TO220)
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0032'), 1, 'R6'),  -- 1K
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0033'), 1, 'R21'),  -- 4.7E
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0034'), 1, 'R21'),  -- 39K
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0035'), 1, 'R1'),  -- 0.1E (WIRE BOND)
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0036'), 1, 'C14'),  -- 1KPF
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0037'), 1, 'C7'),  -- 10KPF
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0038'), 1, 'C8'),  -- 2K2PF 400V AC
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0039'), 2, 'C2, C9'),  -- 1UF/63V
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0040'), 1, 'C12'),  -- 100UF/150V
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0041'), 1, 'C6'),  -- 220UF/450V
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0042'), 2, 'C5, C10'),  -- 470UF/35V
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0043'), 2, 'C1, C4'),  -- 100KPF/310V
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0044'), 1, 'NTC1'),  -- 5D-10
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0045'), 1, 'MOV1'),  -- 20D511K
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0046'), 1, 'MT2'),  -- PQ-4040 VERTICAL
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0047'), 1, 'LF1'),  -- LINE FILTER
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0048'), 1, NULL),  -- 2 PIN CONNECTOR
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0049'), 1, 'Q1'),  -- 24N60
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0050'), 1, 'Q5'),  -- IRF4648
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0051'), 1, 'MT1 (86)g'),  -- HEATSHINK
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0052'), 1, 'A TAG THIMBLE (FEMALE)'),  -- DC LEAD (1.MM)
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0053'), 1, 'WITH CPU CONNECTOR'),  -- AC LEAD (0.75 MM)
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0054'), 2, 'AC LEAD, DC LEAD'),  -- GURMUT
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0055'), 1, 'F1'),  -- FUSE
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0056'), 1, NULL),  -- SS-E-7560I
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0057'), 6, NULL),  -- CERAMIC BEAT
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0058'), 2, 'Q1, D5'),  -- THERMAL PAD
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0059'), 1, '(244)g'),  -- CABINET
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0060'), 2, NULL),  -- SIDE PLATE (PLASTIC)
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0061'), 1, NULL),  -- FAN
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0062'), 1, NULL),  -- COATING
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0063'), 2, NULL),  -- PAINHEAD SCREW(BLACK)
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0064'), 5, 'FRONT, TOP, WARRANTY, OK, DATE'),  -- STICKER
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0065'), 1, NULL),  -- ADESIVE GLUE
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0066'), 1, NULL),  -- EP SHEET
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0067'), 1, NULL),  -- INNER BOX
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0068'), 1, NULL),  -- OUTER BOX
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0069'), 1, NULL),  -- CABLE TYE
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0070'), 1, NULL),  -- SHOLDER
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0071'), 1, NULL),  -- INSULATION SHEET
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0072'), 1, NULL),  -- EARTHING WIRE
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0073'), 4, NULL),  -- GLASS SLEEVE
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0074'), 4, 'FAN'),  -- Fan Screw(black)
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0075'), 11, NULL),  -- Self screw (SILVER)
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0076'), 1, NULL),  -- 10K (NTC)
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0077'), 2, 'Mosfet, Diode'),  -- Spring Washer
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0078'), 5, NULL),  -- Jumper wire
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0079'), 1, 'CN1'),  -- CPU CONNECTOR (5083 3M)
((SELECT id FROM products WHERE sku = 'PRD-001'), (SELECT id FROM components WHERE sku = 'CMP-0080'), 2, 'B+, B-');  -- A TAG (SMALL)

-- Check (expect 80 rows for PRD-001)
SELECT COUNT(*) AS prd001_bom_rows
FROM product_bom
WHERE product_id = (SELECT id FROM products WHERE sku = 'PRD-001');
