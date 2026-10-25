-- GENERATED FILE. Do not edit by hand: run `npm run schema:dump` after adding a migration.
-- Structure only (no data). schema_migrations is created by migrate.js.
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS `inventory_management`;
USE `inventory_management`;

CREATE TABLE IF NOT EXISTS `activity_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `action` varchar(100) NOT NULL,
  `resource` varchar(50) NOT NULL,
  `resource_id` int DEFAULT NULL,
  `summary` varchar(255) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_activity_user` (`user_id`),
  KEY `idx_activity_created` (`created_at`),
  CONSTRAINT `fk_activity_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `attendance` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `attendance_date` date NOT NULL,
  `status` varchar(20) DEFAULT NULL,
  `check_in` time DEFAULT NULL,
  `check_out` time DEFAULT NULL,
  `marked_at` datetime DEFAULT NULL,
  `notes` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_employee_day` (`employee_id`,`attendance_date`),
  KEY `idx_attendance_date` (`attendance_date`),
  CONSTRAINT `fk_attendance_employee` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`),
  CONSTRAINT `chk_attendance_status` CHECK ((`status` in (_utf8mb4'PRESENT',_utf8mb4'ABSENT',_utf8mb4'HALF_DAY',_utf8mb4'LEAVE')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `bill_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `bill_id` int NOT NULL,
  `product_id` int NOT NULL,
  `quantity` int NOT NULL,
  `rate` decimal(12,2) NOT NULL,
  `amount` decimal(14,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_bill_items_bill` (`bill_id`),
  KEY `fk_bill_items_product` (`product_id`),
  CONSTRAINT `fk_bill_items_bill` FOREIGN KEY (`bill_id`) REFERENCES `bills` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_bill_items_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `chk_bill_items_quantity` CHECK ((`quantity` > 0)),
  CONSTRAINT `chk_bill_items_rate` CHECK ((`rate` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `bills` (
  `id` int NOT NULL AUTO_INCREMENT,
  `bill_number` varchar(30) NOT NULL,
  `finished_goods_id` int NOT NULL,
  `order_id` int NOT NULL,
  `customer_id` int DEFAULT NULL,
  `customer_name` varchar(150) NOT NULL,
  `customer_address` varchar(500) DEFAULT NULL,
  `customer_gstin` varchar(20) DEFAULT NULL,
  `gst_percent` decimal(5,2) NOT NULL,
  `subtotal` decimal(14,2) NOT NULL,
  `gst_amount` decimal(14,2) NOT NULL,
  `total` decimal(14,2) NOT NULL,
  `notes` varchar(500) DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_bills_number` (`bill_number`),
  UNIQUE KEY `uq_bills_finished_goods` (`finished_goods_id`),
  KEY `fk_bills_order` (`order_id`),
  KEY `fk_bills_user` (`created_by`),
  KEY `fk_bills_customer` (`customer_id`),
  CONSTRAINT `fk_bills_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  CONSTRAINT `fk_bills_finished_goods` FOREIGN KEY (`finished_goods_id`) REFERENCES `finished_goods` (`id`),
  CONSTRAINT `fk_bills_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  CONSTRAINT `fk_bills_user` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `components` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sku` varchar(50) NOT NULL,
  `name` varchar(150) NOT NULL,
  `description` text,
  `unit` varchar(20) NOT NULL DEFAULT 'pcs',
  `category` varchar(100) DEFAULT NULL,
  `size` varchar(100) DEFAULT NULL,
  `minimum_stock_level` decimal(12,2) NOT NULL DEFAULT '0.00',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sku` (`sku`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `customers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `address` varchar(500) DEFAULT NULL,
  `gstin` varchar(20) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_customers_name` (`name`),
  KEY `fk_customers_user` (`created_by`),
  CONSTRAINT `fk_customers_user` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `employees` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_code` varchar(30) NOT NULL,
  `name` varchar(120) NOT NULL,
  `email` varchar(150) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `department` varchar(80) DEFAULT NULL,
  `designation` varchar(80) DEFAULT NULL,
  `joined_on` date DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `date_of_birth` date DEFAULT NULL,
  `gender` varchar(30) DEFAULT NULL,
  `address` text,
  `emergency_contact_name` varchar(150) DEFAULT NULL,
  `emergency_contact_relationship` varchar(50) DEFAULT NULL,
  `emergency_contact_phone` varchar(30) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `employee_code` (`employee_code`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `extra_material_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `component_id` int NOT NULL,
  `quantity` decimal(12,2) NOT NULL,
  `reason_code` varchar(30) NOT NULL,
  `reason` varchar(255) NOT NULL,
  `status` varchar(12) NOT NULL DEFAULT 'PENDING',
  `requested_by` int NOT NULL,
  `requested_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `decided_by` int DEFAULT NULL,
  `decided_at` datetime DEFAULT NULL,
  `decision_note` varchar(255) DEFAULT NULL,
  `inventory_transaction_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_emr_order` (`order_id`),
  KEY `fk_emr_component` (`component_id`),
  KEY `fk_emr_requested_by` (`requested_by`),
  KEY `fk_emr_decided_by` (`decided_by`),
  KEY `idx_emr_status_requested` (`status`,`requested_at`),
  CONSTRAINT `fk_emr_component` FOREIGN KEY (`component_id`) REFERENCES `components` (`id`),
  CONSTRAINT `fk_emr_decided_by` FOREIGN KEY (`decided_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_emr_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  CONSTRAINT `fk_emr_requested_by` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`),
  CONSTRAINT `chk_emr_quantity` CHECK ((`quantity` > 0)),
  CONSTRAINT `chk_emr_status` CHECK ((`status` in (_utf8mb4'PENDING',_utf8mb4'ISSUED',_utf8mb4'REJECTED')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `finished_goods` (
  `id` int NOT NULL AUTO_INCREMENT,
  `production_id` int NOT NULL,
  `order_id` int NOT NULL,
  `quantity` int NOT NULL,
  `created_by` int DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'PACKAGING',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `dispatched_at` datetime DEFAULT NULL,
  `dispatched_by` int DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `completed_by` int DEFAULT NULL,
  `packed_at` datetime DEFAULT NULL,
  `packed_by` int DEFAULT NULL,
  `handed_over_at` datetime DEFAULT NULL,
  `handed_over_by` int DEFAULT NULL,
  `received_at` datetime DEFAULT NULL,
  `received_by` int DEFAULT NULL,
  `dispatch_note` varchar(255) DEFAULT NULL,
  `delivered_at` datetime DEFAULT NULL,
  `delivered_by` int DEFAULT NULL,
  `delivery_note` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_finished_goods_production` (`production_id`),
  KEY `idx_finished_goods_order` (`order_id`),
  KEY `idx_finished_goods_status` (`status`),
  KEY `fk_finished_goods_created_by` (`created_by`),
  KEY `fk_finished_goods_dispatched_by` (`dispatched_by`),
  KEY `fk_finished_goods_completed_by` (`completed_by`),
  CONSTRAINT `fk_finished_goods_completed_by` FOREIGN KEY (`completed_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_finished_goods_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_finished_goods_dispatched_by` FOREIGN KEY (`dispatched_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_finished_goods_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  CONSTRAINT `fk_finished_goods_production` FOREIGN KEY (`production_id`) REFERENCES `production_orders` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `idempotency_keys` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `idem_key` varchar(64) NOT NULL,
  `action` varchar(60) NOT NULL,
  `request_hash` char(64) NOT NULL,
  `user_id` int DEFAULT NULL,
  `response` mediumtext,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_idempotency_key` (`idem_key`),
  KEY `idx_idempotency_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `inventory` (
  `id` int NOT NULL AUTO_INCREMENT,
  `component_id` int NOT NULL,
  `quantity_on_hand` decimal(12,2) NOT NULL DEFAULT '0.00',
  `quantity_reserved` decimal(12,2) NOT NULL DEFAULT '0.00',
  `location` varchar(100) DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `archived_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `component_id` (`component_id`),
  CONSTRAINT `fk_inventory_component` FOREIGN KEY (`component_id`) REFERENCES `components` (`id`),
  CONSTRAINT `chk_inventory_on_hand` CHECK ((`quantity_on_hand` >= 0)),
  CONSTRAINT `chk_inventory_reserved` CHECK ((`quantity_reserved` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `inventory_transactions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `component_id` int NOT NULL,
  `transaction_type` varchar(30) NOT NULL,
  `direction` varchar(10) NOT NULL DEFAULT 'NONE',
  `quantity` decimal(12,2) NOT NULL,
  `balance_after` decimal(12,2) DEFAULT NULL,
  `reason` varchar(255) DEFAULT NULL,
  `reason_code` varchar(30) DEFAULT NULL,
  `reference_no` varchar(60) DEFAULT NULL,
  `reference_type` varchar(50) DEFAULT NULL,
  `reference_id` int DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `employee_id` int DEFAULT NULL,
  `order_id` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `idempotency_key` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_inv_txn_idempotency` (`idempotency_key`),
  KEY `fk_transaction_created_by` (`created_by`),
  KEY `idx_inv_txn_component_created` (`component_id`,`created_at`,`id`),
  KEY `idx_inv_txn_created` (`created_at`),
  KEY `idx_inv_txn_reason_code` (`reason_code`),
  KEY `fk_inv_txn_employee` (`employee_id`),
  KEY `idx_inv_txn_order` (`order_id`),
  CONSTRAINT `fk_inv_txn_employee` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`),
  CONSTRAINT `fk_inv_txn_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  CONSTRAINT `fk_transaction_component` FOREIGN KEY (`component_id`) REFERENCES `components` (`id`),
  CONSTRAINT `fk_transaction_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `chk_inv_txn_direction` CHECK ((`direction` in (_utf8mb4'IN',_utf8mb4'OUT',_utf8mb4'RESERVE',_utf8mb4'RELEASE',_utf8mb4'NONE'))),
  CONSTRAINT `chk_inv_txn_quantity` CHECK ((`quantity` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `notification_reads` (
  `notification_id` bigint NOT NULL,
  `user_id` int NOT NULL,
  `read_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`notification_id`,`user_id`),
  KEY `idx_notification_reads_user` (`user_id`),
  CONSTRAINT `fk_notification_reads_notification` FOREIGN KEY (`notification_id`) REFERENCES `notifications` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_notification_reads_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `notifications` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `role` varchar(50) NOT NULL,
  `type` varchar(50) NOT NULL,
  `title` varchar(255) NOT NULL,
  `body` varchar(500) DEFAULT NULL,
  `severity` varchar(16) NOT NULL DEFAULT 'info',
  `link` varchar(255) DEFAULT NULL,
  `requires_action` tinyint(1) NOT NULL DEFAULT '0',
  `order_id` int DEFAULT NULL,
  `payload` json NOT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `done_by` int DEFAULT NULL,
  `done_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_notifications_role_open` (`role`,`done_at`,`id`),
  CONSTRAINT `chk_notifications_severity` CHECK ((`severity` in (_utf8mb4'info',_utf8mb4'success',_utf8mb4'warning',_utf8mb4'action')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `order_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `product_id` int NOT NULL,
  `quantity` decimal(12,2) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_order_items_order` (`order_id`),
  KEY `fk_order_items_product` (`product_id`),
  CONSTRAINT `fk_order_items_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_order_items_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `chk_order_item_quantity` CHECK ((`quantity` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `order_production_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `product_id` int NOT NULL,
  `quantity` decimal(12,2) NOT NULL,
  `sent_by` int DEFAULT NULL,
  `sent_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_opi_order_product` (`order_id`,`product_id`),
  KEY `fk_opi_product` (`product_id`),
  KEY `fk_opi_sent_by` (`sent_by`),
  CONSTRAINT `fk_opi_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_opi_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `fk_opi_sent_by` FOREIGN KEY (`sent_by`) REFERENCES `users` (`id`),
  CONSTRAINT `chk_opi_quantity` CHECK ((`quantity` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `order_purchase_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `component_id` int NOT NULL,
  `quantity` decimal(12,2) NOT NULL,
  `purchase_order_id` int DEFAULT NULL,
  `sent_by` int DEFAULT NULL,
  `sent_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_opu_order_component` (`order_id`,`component_id`),
  KEY `fk_opu_component` (`component_id`),
  KEY `fk_opu_sent_by` (`sent_by`),
  KEY `idx_opu_purchase_order` (`purchase_order_id`),
  CONSTRAINT `fk_opu_component` FOREIGN KEY (`component_id`) REFERENCES `components` (`id`),
  CONSTRAINT `fk_opu_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_opu_purchase_order` FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders` (`id`),
  CONSTRAINT `fk_opu_sent_by` FOREIGN KEY (`sent_by`) REFERENCES `users` (`id`),
  CONSTRAINT `chk_opu_quantity` CHECK ((`quantity` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `orders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_number` varchar(50) NOT NULL,
  `parent_order_id` int DEFAULT NULL,
  `status` varchar(40) NOT NULL DEFAULT 'PENDING',
  `estimated_delivery_date` date DEFAULT NULL,
  `approval_status` varchar(20) NOT NULL DEFAULT 'PENDING_APPROVAL',
  `sent_to_admin_at` datetime DEFAULT NULL,
  `approval_remarks` varchar(500) DEFAULT NULL,
  `revision` json DEFAULT NULL,
  `revised_by` int DEFAULT NULL,
  `revised_at` datetime DEFAULT NULL,
  `revision_accepted_by` int DEFAULT NULL,
  `revision_accepted_at` datetime DEFAULT NULL,
  `approved_by` int DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `inventory_issued_at` datetime DEFAULT NULL,
  `approval_round` int NOT NULL DEFAULT '0',
  `created_by` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `order_number` (`order_number`),
  KEY `fk_orders_created_by` (`created_by`),
  KEY `fk_orders_approved_by` (`approved_by`),
  KEY `idx_orders_approval` (`approval_status`,`created_at`),
  KEY `fk_orders_parent` (`parent_order_id`),
  KEY `fk_orders_revised_by` (`revised_by`),
  KEY `fk_orders_revision_accepted_by` (`revision_accepted_by`),
  CONSTRAINT `fk_orders_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_orders_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_orders_parent` FOREIGN KEY (`parent_order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_orders_revised_by` FOREIGN KEY (`revised_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_orders_revision_accepted_by` FOREIGN KEY (`revision_accepted_by`) REFERENCES `users` (`id`),
  CONSTRAINT `chk_orders_approval_status` CHECK ((`approval_status` in (_utf8mb4'DRAFT',_utf8mb4'PENDING_APPROVAL',_utf8mb4'QUANTITY_REVISED',_utf8mb4'APPROVED',_utf8mb4'REJECTED',_utf8mb4'CANCELLED')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `product_bom` (
  `id` int NOT NULL AUTO_INCREMENT,
  `product_id` int NOT NULL,
  `component_id` int NOT NULL,
  `quantity_required` decimal(12,2) DEFAULT NULL,
  `location` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_product_component` (`product_id`,`component_id`),
  KEY `fk_bom_component` (`component_id`),
  CONSTRAINT `fk_bom_component` FOREIGN KEY (`component_id`) REFERENCES `components` (`id`),
  CONSTRAINT `fk_bom_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `chk_bom_quantity` CHECK ((`quantity_required` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `product_stock` (
  `product_id` int NOT NULL,
  `quantity_on_hand` int NOT NULL DEFAULT '0',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`product_id`),
  CONSTRAINT `fk_product_stock_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `chk_product_stock_qty` CHECK ((`quantity_on_hand` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `product_stock_transactions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `product_id` int NOT NULL,
  `direction` varchar(3) NOT NULL,
  `quantity` int NOT NULL,
  `balance_after` int NOT NULL,
  `finished_goods_id` int DEFAULT NULL,
  `order_id` int DEFAULT NULL,
  `reason` varchar(255) NOT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_pst_finished_goods` (`finished_goods_id`),
  KEY `fk_pst_order` (`order_id`),
  KEY `fk_pst_user` (`created_by`),
  KEY `idx_pst_product_created` (`product_id`,`created_at`,`id`),
  CONSTRAINT `fk_pst_finished_goods` FOREIGN KEY (`finished_goods_id`) REFERENCES `finished_goods` (`id`),
  CONSTRAINT `fk_pst_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  CONSTRAINT `fk_pst_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `fk_pst_user` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `chk_pst_direction` CHECK ((`direction` in (_utf8mb4'IN',_utf8mb4'OUT'))),
  CONSTRAINT `chk_pst_quantity` CHECK ((`quantity` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `production_material_issues` (
  `id` int NOT NULL AUTO_INCREMENT,
  `request_item_id` int NOT NULL,
  `quantity` decimal(12,2) NOT NULL,
  `issued_by` int NOT NULL,
  `remarks` varchar(255) DEFAULT NULL,
  `idempotency_key` varchar(64) DEFAULT NULL,
  `issued_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pmi_idempotency_item` (`idempotency_key`,`request_item_id`),
  KEY `fk_pmi_issued_by` (`issued_by`),
  KEY `idx_pmi_request_item_date` (`request_item_id`,`issued_at`),
  CONSTRAINT `fk_pmi_issued_by` FOREIGN KEY (`issued_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_pmi_request_item` FOREIGN KEY (`request_item_id`) REFERENCES `production_material_request_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_pmi_quantity` CHECK ((`quantity` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `production_material_request_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `request_id` int NOT NULL,
  `component_id` int NOT NULL,
  `quantity_per_product` decimal(12,2) DEFAULT NULL,
  `requested_quantity` decimal(12,2) NOT NULL,
  `issued_quantity` decimal(12,2) NOT NULL DEFAULT '0.00',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pmri_request_component` (`request_id`,`component_id`),
  KEY `idx_pmri_component` (`component_id`),
  CONSTRAINT `fk_pmri_component` FOREIGN KEY (`component_id`) REFERENCES `components` (`id`),
  CONSTRAINT `fk_pmri_request` FOREIGN KEY (`request_id`) REFERENCES `production_material_requests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_pmri_issued` CHECK (((`issued_quantity` >= 0) and (`issued_quantity` <= `requested_quantity`))),
  CONSTRAINT `chk_pmri_requested` CHECK ((`requested_quantity` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `production_material_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `order_item_id` int NOT NULL,
  `requested_product_quantity` decimal(12,2) DEFAULT NULL,
  `issued_product_quantity` decimal(12,2) NOT NULL DEFAULT '0.00',
  `requested_by` int NOT NULL,
  `request_key` varchar(64) DEFAULT NULL,
  `status` varchar(24) NOT NULL DEFAULT 'PENDING',
  `notes` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pmr_request_key` (`request_key`),
  KEY `fk_pmr_order` (`order_id`),
  KEY `fk_pmr_requested_by` (`requested_by`),
  KEY `idx_pmr_status_created` (`status`,`created_at`),
  KEY `idx_pmr_order_item` (`order_item_id`,`created_at`),
  CONSTRAINT `fk_pmr_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pmr_order_item` FOREIGN KEY (`order_item_id`) REFERENCES `order_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pmr_requested_by` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`),
  CONSTRAINT `chk_pmr_status` CHECK ((`status` in (_utf8mb4'PENDING',_utf8mb4'PARTIALLY_ISSUED',_utf8mb4'ISSUED')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `production_orders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `order_item_id` int DEFAULT NULL,
  `status` varchar(40) NOT NULL DEFAULT 'READY_FOR_PRODUCTION',
  `started_by` int DEFAULT NULL,
  `updated_by` int DEFAULT NULL,
  `started_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `quantity_to_produce` int NOT NULL DEFAULT '0',
  `quantity_completed` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_production_orders_order_item` (`order_item_id`),
  KEY `fk_production_started_by` (`started_by`),
  KEY `fk_production_updated_by` (`updated_by`),
  KEY `idx_production_orders_order_id` (`order_id`),
  CONSTRAINT `fk_production_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_production_orders_order_item` FOREIGN KEY (`order_item_id`) REFERENCES `order_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_production_started_by` FOREIGN KEY (`started_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_production_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `products` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sku` varchar(50) NOT NULL,
  `name` varchar(150) NOT NULL,
  `description` text,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_by` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sku` (`sku`),
  KEY `fk_products_created_by` (`created_by`),
  CONSTRAINT `fk_products_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `purchase_order_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `purchase_order_id` int NOT NULL,
  `component_id` int NOT NULL,
  `quantity_ordered` decimal(12,2) NOT NULL,
  `quantity_received` decimal(12,2) DEFAULT NULL,
  `quantity_defective` decimal(12,2) NOT NULL DEFAULT '0.00',
  `quantity_approved` decimal(12,2) DEFAULT NULL,
  `iqc_decision` varchar(10) DEFAULT NULL,
  `remarks` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_poi_po_component` (`purchase_order_id`,`component_id`),
  KEY `fk_poi_component` (`component_id`),
  CONSTRAINT `fk_poi_component` FOREIGN KEY (`component_id`) REFERENCES `components` (`id`),
  CONSTRAINT `fk_poi_po` FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders` (`id`),
  CONSTRAINT `chk_poi_decision` CHECK (((`iqc_decision` is null) or (`iqc_decision` in (_utf8mb4'APPROVED',_utf8mb4'REJECTED')))),
  CONSTRAINT `chk_poi_ordered` CHECK ((`quantity_ordered` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `purchase_orders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `po_number` varchar(50) NOT NULL,
  `order_id` int DEFAULT NULL,
  `supplier` varchar(150) NOT NULL,
  `notes` varchar(500) DEFAULT NULL,
  `expected_delivery_date` date DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'ORDER_PLACED',
  `created_by` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `received_by` int DEFAULT NULL,
  `received_at` datetime DEFAULT NULL,
  `sent_to_iqc_by` int DEFAULT NULL,
  `sent_to_iqc_at` datetime DEFAULT NULL,
  `iqc_by` int DEFAULT NULL,
  `iqc_at` datetime DEFAULT NULL,
  `iqc_remarks` varchar(500) DEFAULT NULL,
  `accepted_by` int DEFAULT NULL,
  `accepted_at` datetime DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `po_number` (`po_number`),
  KEY `fk_po_created_by` (`created_by`),
  KEY `fk_po_iqc_by` (`iqc_by`),
  KEY `fk_po_accepted_by` (`accepted_by`),
  KEY `idx_po_status` (`status`,`created_at`),
  KEY `fk_po_received_by` (`received_by`),
  KEY `fk_po_sent_to_iqc_by` (`sent_to_iqc_by`),
  KEY `idx_po_order` (`order_id`),
  CONSTRAINT `fk_po_accepted_by` FOREIGN KEY (`accepted_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_po_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_po_iqc_by` FOREIGN KEY (`iqc_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_po_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  CONSTRAINT `fk_po_received_by` FOREIGN KEY (`received_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_po_sent_to_iqc_by` FOREIGN KEY (`sent_to_iqc_by`) REFERENCES `users` (`id`),
  CONSTRAINT `chk_po_status` CHECK ((`status` in (_utf8mb4'ORDER_PLACED',_utf8mb4'RECEIVED',_utf8mb4'PENDING_IQC',_utf8mb4'PENDING_STORE',_utf8mb4'STORED',_utf8mb4'REJECTED')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `role` varchar(40) NOT NULL,
  `endpoint` varchar(600) NOT NULL,
  `p256dh` varchar(255) NOT NULL,
  `auth` varchar(100) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_push_endpoint_role` (`endpoint`,`role`),
  KEY `idx_push_role` (`role`),
  KEY `fk_push_subscriptions_user` (`user_id`),
  CONSTRAINT `fk_push_subscriptions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `quality_control_batch_decisions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `production_id` int NOT NULL,
  `attempt_number` int NOT NULL DEFAULT '1',
  `decision` varchar(10) NOT NULL,
  `sample_size` int DEFAULT NULL,
  `sample_failed` int DEFAULT NULL,
  `remarks` text,
  `decided_by` int DEFAULT NULL,
  `decided_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_qc_batch_decision_attempt` (`production_id`,`attempt_number`),
  KEY `fk_qc_batch_decision_user` (`decided_by`),
  KEY `idx_qc_batch_decision_decision_at` (`decision`,`decided_at`),
  KEY `idx_qc_batch_decision_production_attempt` (`production_id`,`attempt_number`),
  CONSTRAINT `fk_qc_batch_decision_production` FOREIGN KEY (`production_id`) REFERENCES `production_orders` (`id`),
  CONSTRAINT `fk_qc_batch_decision_user` FOREIGN KEY (`decided_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `quality_control_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `production_id` int NOT NULL,
  `quantity_inspected` int NOT NULL,
  `quantity_approved` int NOT NULL DEFAULT '0',
  `quantity_rejected` int NOT NULL DEFAULT '0',
  `overall_result` varchar(10) NOT NULL,
  `remarks` text,
  `checked_by` int NOT NULL,
  `checked_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_qc_user` (`checked_by`),
  KEY `idx_qc_production` (`production_id`),
  CONSTRAINT `fk_qc_production` FOREIGN KEY (`production_id`) REFERENCES `production_orders` (`id`),
  CONSTRAINT `fk_qc_user` FOREIGN KEY (`checked_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `quality_control_rework_cycles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `production_id` int NOT NULL,
  `failed_attempt_number` int NOT NULL,
  `failure_decision_id` int NOT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'NEEDS_REWORK',
  `started_by` int DEFAULT NULL,
  `started_at` datetime DEFAULT NULL,
  `submitted_by` int DEFAULT NULL,
  `submitted_at` datetime DEFAULT NULL,
  `reviewed_by` int DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `rework_remarks` text,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_qc_rework_production_attempt` (`production_id`,`failed_attempt_number`),
  KEY `fk_qc_rework_failure_decision` (`failure_decision_id`),
  KEY `fk_qc_rework_started_by` (`started_by`),
  KEY `fk_qc_rework_submitted_by` (`submitted_by`),
  KEY `fk_qc_rework_reviewed_by` (`reviewed_by`),
  KEY `idx_qc_rework_status` (`status`,`updated_at`),
  KEY `idx_qc_rework_production_status` (`production_id`,`status`),
  CONSTRAINT `fk_qc_rework_failure_decision` FOREIGN KEY (`failure_decision_id`) REFERENCES `quality_control_batch_decisions` (`id`),
  CONSTRAINT `fk_qc_rework_production` FOREIGN KEY (`production_id`) REFERENCES `production_orders` (`id`),
  CONSTRAINT `fk_qc_rework_reviewed_by` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_qc_rework_started_by` FOREIGN KEY (`started_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_qc_rework_submitted_by` FOREIGN KEY (`submitted_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `testing_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `production_id` int NOT NULL,
  `quantity_tested` int NOT NULL,
  `quantity_passed` int NOT NULL DEFAULT '0',
  `quantity_failed` int NOT NULL DEFAULT '0',
  `overall_result` varchar(10) NOT NULL,
  `remarks` text,
  `tested_by` int NOT NULL,
  `tested_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_testing_user` (`tested_by`),
  KEY `idx_testing_production` (`production_id`),
  CONSTRAINT `fk_testing_production` FOREIGN KEY (`production_id`) REFERENCES `production_orders` (`id`),
  CONSTRAINT `fk_testing_user` FOREIGN KEY (`tested_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `email` varchar(150) NOT NULL,
  `password_hash` varchar(255) DEFAULT NULL,
  `role` varchar(30) NOT NULL DEFAULT 'SUPER_ADMIN',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `fk_users_created_by` (`created_by`),
  CONSTRAINT `fk_users_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DROP TRIGGER IF EXISTS `trg_inv_txn_no_delete`;
CREATE TRIGGER `trg_inv_txn_no_delete` BEFORE DELETE ON `inventory_transactions` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'inventory_transactions is append-only: rows cannot be deleted';

DROP TRIGGER IF EXISTS `trg_inv_txn_no_update`;
CREATE TRIGGER `trg_inv_txn_no_update` BEFORE UPDATE ON `inventory_transactions` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'inventory_transactions is append-only: rows cannot be modified';

SET FOREIGN_KEY_CHECKS = 1;
