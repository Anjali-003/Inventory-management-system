-- The story of an order between Marketing and the Operations Admin, one row per step: who did what, when, and how
-- many units it was about. Shown the same way to both roles (the order's Timeline).
--   kind: SENT, REVISED, REVISION_ACCEPTED, REVISION_DECLINED, APPROVED, REJECTED, SENT_TO_PURCHASE, SENT_TO_PRODUCTION
CREATE TABLE IF NOT EXISTS order_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  kind VARCHAR(30) NOT NULL,
  actor_id INT NULL,
  quantity INT NULL,
  detail JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_order_events_order (order_id, id),
  CONSTRAINT fk_order_events_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_order_events_actor FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL
);
