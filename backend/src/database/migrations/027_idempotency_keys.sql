-- Request-level idempotency for stock-deducting actions (order approve / dispatch).
--
-- One row per request that was APPLIED. The row is inserted inside the same transaction that deducts the stock, so
-- "the stock moved" and "the key is remembered" commit or roll back together: there is no window in which one is
-- true without the other. A repeat of the same request (double click, network retry, proxy replay) finds its row,
-- and is answered with the stored response instead of running again.
--
--   idem_key      the client's key (UUID), unique on its own: a key can never be reused for another request
--   request_hash  SHA-256 of (user, action, order, body). Same key + different hash = a client bug, refused (422)
--   response      the JSON the first request returned, replayed verbatim
--
-- Rows are only needed while a client could still retry, so they are purged after a few days (see
-- src/shared/idempotency.js, purgeExpired).
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  idem_key VARCHAR(64) NOT NULL,
  action VARCHAR(60) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  user_id INT NULL,
  response MEDIUMTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_idempotency_key (idem_key),
  KEY idx_idempotency_created (created_at)
) ENGINE=InnoDB;
