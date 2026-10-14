-- Purchase flow now has two steps BEFORE IQC:
--   ORDER_PLACED   order placed with the supplier (this is what a new purchase starts as)
--   RECEIVED       goods arrived; nothing has gone to IQC yet
--   PENDING_IQC    purchase manager pressed "Send to IQC": only now does it show up in the IQC queue
-- Existing rows keep their current status. Who received / sent to IQC is stored for the history.

ALTER TABLE purchase_orders DROP CHECK chk_po_status;

ALTER TABLE purchase_orders
  MODIFY COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ORDER_PLACED',
  ADD COLUMN received_by INT NULL AFTER created_at,
  ADD COLUMN received_at DATETIME NULL AFTER received_by,
  ADD COLUMN sent_to_iqc_by INT NULL AFTER received_at,
  ADD COLUMN sent_to_iqc_at DATETIME NULL AFTER sent_to_iqc_by,
  ADD CONSTRAINT fk_po_received_by FOREIGN KEY (received_by) REFERENCES users(id),
  ADD CONSTRAINT fk_po_sent_to_iqc_by FOREIGN KEY (sent_to_iqc_by) REFERENCES users(id),
  ADD CONSTRAINT chk_po_status CHECK (status IN ('ORDER_PLACED', 'RECEIVED', 'PENDING_IQC', 'PENDING_STORE', 'STORED', 'REJECTED'));
