-- Where the component sits on the PCB (e.g. "R4, R7, R12, R22") or a short note. Belongs to the BOM line, not the component.
ALTER TABLE product_bom
  ADD COLUMN `location` VARCHAR(255) NULL AFTER quantity_required;
