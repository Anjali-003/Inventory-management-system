-- Notification inbox: every notification is now saved (no more toast-only messages that vanish when the tab is closed).
--   body             one line of detail shown under the title
--   severity         info | success | warning | action   (colour + icon in the bell and the toast)
--   link             page that opens when the notification is clicked (e.g. /marketing-orders?order=12)
--   requires_action  1 = a task for the whole role (e.g. "issue these components"); one user marks it done for everyone
-- Read / unread is per USER: notification_reads holds one row per (notification, user) once that user has seen it.

ALTER TABLE notifications
  ADD COLUMN body VARCHAR(500) NULL AFTER title,
  ADD COLUMN severity VARCHAR(16) NOT NULL DEFAULT 'info' AFTER body,
  ADD COLUMN link VARCHAR(255) NULL AFTER severity,
  ADD COLUMN requires_action TINYINT(1) NOT NULL DEFAULT 0 AFTER link,
  ADD CONSTRAINT chk_notifications_severity CHECK (severity IN ('info', 'success', 'warning', 'action'));

UPDATE notifications SET severity = 'action', requires_action = 1, link = '/dashboard' WHERE type = 'ISSUE_COMPONENTS';
UPDATE notifications SET severity = 'warning', link = CONCAT('/marketing-orders?order=', order_id) WHERE type = 'DELIVERY_DATE_CHANGED' AND order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS notification_reads (
    notification_id BIGINT NOT NULL,
    user_id INT NOT NULL,
    read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (notification_id, user_id),
    INDEX idx_notification_reads_user (user_id),
    CONSTRAINT fk_notification_reads_notification FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
    CONSTRAINT fk_notification_reads_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
