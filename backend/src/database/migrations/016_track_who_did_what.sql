-- "Who did this" columns, so every super admin can see who created / moved a record.
-- orders.created_by, production_orders.started_by, testing_records.tested_by and
-- quality_control_records.checked_by already exist; this adds the ones that were missing.
-- Old rows keep NULL (shown as "-" in the UI): we do not guess who did them.

ALTER TABLE production_orders
  ADD COLUMN updated_by INT NULL AFTER started_by,
  ADD CONSTRAINT fk_production_updated_by FOREIGN KEY (updated_by) REFERENCES users(id);

ALTER TABLE finished_goods
  ADD COLUMN created_by INT NULL AFTER quantity,
  ADD COLUMN dispatched_by INT NULL AFTER dispatched_at,
  ADD COLUMN completed_by INT NULL AFTER completed_at,
  ADD CONSTRAINT fk_finished_goods_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  ADD CONSTRAINT fk_finished_goods_dispatched_by FOREIGN KEY (dispatched_by) REFERENCES users(id),
  ADD CONSTRAINT fk_finished_goods_completed_by FOREIGN KEY (completed_by) REFERENCES users(id);

ALTER TABLE products
  ADD COLUMN created_by INT NULL,
  ADD CONSTRAINT fk_products_created_by FOREIGN KEY (created_by) REFERENCES users(id);
