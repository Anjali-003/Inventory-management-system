CREATE DATABASE IF NOT EXISTS inventory_management;

USE inventory_management;


-- =========================================
-- 1. USERS
-- =========================================

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255),
    role VARCHAR(30) NOT NULL DEFAULT 'ADMIN',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
);


-- =========================================
-- 2. PRODUCTS
-- =========================================

CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sku VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
);


-- =========================================
-- 3. COMPONENTS
-- =========================================

CREATE TABLE IF NOT EXISTS components (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sku VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    unit VARCHAR(20) NOT NULL DEFAULT 'pcs',
    minimum_stock_level DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
);


-- =========================================
-- 4. PRODUCT BOM
-- =========================================

CREATE TABLE IF NOT EXISTS product_bom (
    id INT AUTO_INCREMENT PRIMARY KEY,

    product_id INT NOT NULL,
    component_id INT NOT NULL,

    quantity_required DECIMAL(12,2) NOT NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_bom_product
        FOREIGN KEY (product_id)
        REFERENCES products(id),

    CONSTRAINT fk_bom_component
        FOREIGN KEY (component_id)
        REFERENCES components(id),

    CONSTRAINT unique_product_component
        UNIQUE (product_id, component_id),

    CONSTRAINT chk_bom_quantity
        CHECK (quantity_required > 0)
);


-- =========================================
-- 5. INVENTORY
-- =========================================

CREATE TABLE IF NOT EXISTS inventory (
    id INT AUTO_INCREMENT PRIMARY KEY,

    component_id INT NOT NULL UNIQUE,

    quantity_on_hand DECIMAL(12,2) NOT NULL DEFAULT 0,
    quantity_reserved DECIMAL(12,2) NOT NULL DEFAULT 0,

    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_inventory_component
        FOREIGN KEY (component_id)
        REFERENCES components(id),

    CONSTRAINT chk_inventory_on_hand
        CHECK (quantity_on_hand >= 0),

    CONSTRAINT chk_inventory_reserved
        CHECK (quantity_reserved >= 0)
);


-- =========================================
-- 6. ORDERS
-- =========================================

CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,

    order_number VARCHAR(50) NOT NULL UNIQUE,

    status VARCHAR(40) NOT NULL DEFAULT 'PENDING',

    created_by INT NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_orders_created_by
        FOREIGN KEY (created_by)
        REFERENCES users(id)
);


-- =========================================
-- 7. ORDER ITEMS
-- =========================================

CREATE TABLE IF NOT EXISTS order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,

    order_id INT NOT NULL,
    product_id INT NOT NULL,

    quantity DECIMAL(12,2) NOT NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_order_items_order
        FOREIGN KEY (order_id)
        REFERENCES orders(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_order_items_product
        FOREIGN KEY (product_id)
        REFERENCES products(id),

    CONSTRAINT chk_order_item_quantity
        CHECK (quantity > 0)
);


-- =========================================
-- 8. PRODUCTION ORDERS
-- =========================================

CREATE TABLE IF NOT EXISTS production_orders (
    id INT AUTO_INCREMENT PRIMARY KEY,

    order_id INT NOT NULL UNIQUE,

    status VARCHAR(40) NOT NULL DEFAULT 'READY_FOR_PRODUCTION',

    started_by INT NULL,

    started_at DATETIME NULL,
    completed_at DATETIME NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_production_order
        FOREIGN KEY (order_id)
        REFERENCES orders(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_production_started_by
        FOREIGN KEY (started_by)
        REFERENCES users(id)
);


-- =========================================
-- 9. INVENTORY TRANSACTIONS
-- =========================================

CREATE TABLE IF NOT EXISTS inventory_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,

    component_id INT NOT NULL,

    transaction_type VARCHAR(30) NOT NULL,

    quantity DECIMAL(12,2) NOT NULL,

    reference_type VARCHAR(50),
    reference_id INT,

    created_by INT NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_transaction_component
        FOREIGN KEY (component_id)
        REFERENCES components(id),

    CONSTRAINT fk_transaction_created_by
        FOREIGN KEY (created_by)
        REFERENCES users(id)
);