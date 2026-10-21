-- Role notifications shown on a dashboard (first use: "issue these components to production" for the Store Manager).
-- A row is written inside the same DB transaction as the change that caused it, so it exists only if that change committed.
-- Any user of `role` may mark it done; the row then stays as history.
CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    role VARCHAR(50) NOT NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    order_id INT NULL,
    payload JSON NOT NULL,
    created_by INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    done_by INT NULL,
    done_at DATETIME NULL,
    INDEX idx_notifications_role_open (role, done_at, id)
);
