-- Some BOM lines (e.g. coating, glue) have no fixed quantity yet. NULL means "not specified"; the existing CHECK (quantity_required > 0) still applies to every value that is set.
ALTER TABLE product_bom
  MODIFY COLUMN quantity_required DECIMAL(12,2) NULL;
