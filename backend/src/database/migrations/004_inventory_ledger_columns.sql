-- Stock ledger: make every row self-describing (direction, balance, reason, reference)
-- and give it an idempotency key so a retried/double-clicked request can never post twice.
ALTER TABLE inventory_transactions
  ADD COLUMN direction VARCHAR(10) NOT NULL DEFAULT 'NONE' AFTER transaction_type,
  ADD COLUMN balance_after DECIMAL(12,2) NULL AFTER quantity,
  ADD COLUMN reason VARCHAR(255) NULL AFTER balance_after,
  ADD COLUMN reference_no VARCHAR(60) NULL AFTER reason,
  ADD COLUMN idempotency_key VARCHAR(64) NULL,
  ADD UNIQUE KEY uq_inv_txn_idempotency (idempotency_key),
  ADD KEY idx_inv_txn_component_created (component_id, created_at, id),
  ADD KEY idx_inv_txn_created (created_at),
  ADD CONSTRAINT chk_inv_txn_direction CHECK (direction IN ('IN','OUT','RESERVE','RELEASE','NONE')),
  ADD CONSTRAINT chk_inv_txn_quantity CHECK (quantity >= 0);

-- Safe delete = archive. The row (and its whole ledger) is kept, it is only hidden.
ALTER TABLE inventory
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN archived_at DATETIME NULL;
