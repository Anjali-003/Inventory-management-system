-- Version products and their BOMs without mutating previously used product definitions.
-- Existing products become the first version in their own product family.

ALTER TABLE products
  ADD COLUMN version_family_id INT NULL AFTER id,
  ADD COLUMN version_major INT NOT NULL DEFAULT 1 AFTER version_family_id,
  ADD COLUMN version_minor INT NOT NULL DEFAULT 0 AFTER version_major;

UPDATE products
SET version_family_id = id
WHERE version_family_id IS NULL;

ALTER TABLE products
  ADD UNIQUE KEY uq_products_version (version_family_id, version_major, version_minor),
  ADD CONSTRAINT fk_products_version_family
    FOREIGN KEY (version_family_id) REFERENCES products(id);
