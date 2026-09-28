USE inventory_management;


-- =========================================
-- 1. ADMIN USER
-- =========================================

INSERT INTO users (
    name,
    email,
    password_hash,
    role
)
VALUES (
    'Admin',
    'admin@company.com',
    NULL,
    'ADMIN'
);


-- =========================================
-- 2. PRODUCTS
-- =========================================

INSERT INTO products (
    sku,
    name,
    description
)
VALUES
(
    'PRD-001',
    'LED Display Module',
    'Electronic LED display module'
),
(
    'PRD-002',
    'Control Board',
    'Electronic control board'
);


-- =========================================
-- 3. COMPONENTS
-- =========================================

INSERT INTO components (
    sku,
    name,
    description,
    unit,
    minimum_stock_level
)
VALUES

('CMP-001', 'LED Display PCB', 'PCB for LED display', 'pcs', 30),

('CMP-002', 'Red LED', 'Red LED component', 'pcs', 1000),

('CMP-003', '220Ω Resistor', '220 ohm resistor', 'pcs', 200),

('CMP-004', '10KΩ Resistor', '10 kilo-ohm resistor', 'pcs', 200),

('CMP-005', '100nF Capacitor', '100nF capacitor', 'pcs', 200),

('CMP-006', 'Display Driver IC', 'IC for LED display driving', 'pcs', 50),

('CMP-007', '16-Pin Connector', '16 pin connector', 'pcs', 50),

('CMP-008', 'Voltage Regulator', 'Voltage regulator', 'pcs', 50),

('CMP-009', 'Plastic Enclosure', 'Plastic enclosure', 'pcs', 50),

('CMP-010', 'M3 Screw', 'M3 mounting screw', 'pcs', 100),

('CMP-011', 'Control Board PCB', 'PCB for control board', 'pcs', 30),

('CMP-012', 'ESP32 Microcontroller', 'ESP32 microcontroller', 'pcs', 50),

('CMP-013', '1KΩ Resistor', '1 kilo-ohm resistor', 'pcs', 100),

('CMP-014', '100µF Capacitor', '100 microfarad capacitor', 'pcs', 50),

('CMP-015', '5V Relay', '5V relay', 'pcs', 50),

('CMP-016', 'Relay Driver IC', 'Relay driver integrated circuit', 'pcs', 20),

('CMP-017', 'Terminal Block', 'Terminal block connector', 'pcs', 50),

('CMP-018', 'Green LED', 'Green LED component', 'pcs', 100);


-- =========================================
-- 4. LED DISPLAY BOM
-- =========================================

INSERT INTO product_bom (
    product_id,
    component_id,
    quantity_required
)
VALUES

(1, 1, 1),     -- LED Display PCB
(1, 2, 64),    -- Red LED
(1, 3, 8),     -- 220Ω Resistor
(1, 4, 4),     -- 10KΩ Resistor
(1, 5, 4),     -- 100nF Capacitor
(1, 6, 2),     -- Display Driver IC
(1, 7, 2),     -- 16-Pin Connector
(1, 8, 1),     -- Voltage Regulator
(1, 9, 1),     -- Plastic Enclosure
(1, 10, 4);   -- M3 Screw


-- =========================================
-- 5. CONTROL BOARD BOM
-- =========================================

INSERT INTO product_bom (
    product_id,
    component_id,
    quantity_required
)
VALUES

(2, 11, 1),    -- Control Board PCB
(2, 12, 1),    -- ESP32
(2, 4, 10),    -- 10KΩ Resistor
(2, 13, 6),    -- 1KΩ Resistor
(2, 5, 8),     -- 100nF Capacitor
(2, 14, 2),    -- 100µF Capacitor
(2, 15, 4),    -- 5V Relay
(2, 16, 1),    -- Relay Driver IC
(2, 8, 1),     -- Voltage Regulator
(2, 7, 2),     -- 16-Pin Connector
(2, 17, 4),    -- Terminal Block
(2, 18, 4),    -- Green LED
(2, 10, 4);   -- M3 Screw


-- =========================================
-- 6. INVENTORY
-- =========================================

INSERT INTO inventory (
    component_id,
    quantity_on_hand,
    quantity_reserved
)
VALUES

(1, 150, 0),      -- LED Display PCB
(2, 5000, 0),     -- Red LED
(3, 900, 0),      -- 220Ω Resistor
(4, 750, 0),      -- 10KΩ Resistor
(5, 1500, 0),     -- 100nF Capacitor
(6, 300, 0),      -- Display Driver IC
(7, 500, 0),      -- 16-Pin Connector
(8, 300, 0),      -- Voltage Regulator
(9, 60, 0),       -- Plastic Enclosure
(10, 500, 0),     -- M3 Screw

(11, 100, 0),     -- Control Board PCB
(12, 100, 0),     -- ESP32
(13, 500, 0),     -- 1KΩ Resistor
(14, 100, 0),     -- 100µF Capacitor
(15, 200, 0),     -- 5V Relay
(16, 50, 0),      -- Relay Driver IC
(17, 200, 0),     -- Terminal Block
(18, 500, 0);     -- Green LED