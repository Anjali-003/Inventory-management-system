-- Component attributes shown in the Stock list: category (e.g. Resistor, PCB) and size (e.g. 5mm, 0805, 10x20 cm).
-- Optional free text. They belong to the component, not to a stock location.
ALTER TABLE components
  ADD COLUMN `category` VARCHAR(100) NULL AFTER `unit`,
  ADD COLUMN `size` VARCHAR(100) NULL AFTER `category`;
