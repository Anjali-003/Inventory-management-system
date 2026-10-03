-- Where the stock physically sits (rack / shelf / godown). Optional, free text.
ALTER TABLE inventory
  ADD COLUMN location VARCHAR(100) NULL AFTER quantity_reserved;
