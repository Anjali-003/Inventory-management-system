-- History must never be silently rewritten: the ledger is append-only at the database level.
-- (Corrections are made by posting a new ADJUSTMENT row, never by editing an old one.)
CREATE TRIGGER trg_inv_txn_no_update BEFORE UPDATE ON inventory_transactions
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'inventory_transactions is append-only: rows cannot be modified';

CREATE TRIGGER trg_inv_txn_no_delete BEFORE DELETE ON inventory_transactions
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'inventory_transactions is append-only: rows cannot be deleted';
