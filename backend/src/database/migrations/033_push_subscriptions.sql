-- Web Push: the browsers (phone / desktop) that asked for notifications, one row per browser AND role.
-- A notification for a role is also pushed to these, so it pops up even when the app is closed.
--   endpoint, p256dh, auth   what the browser's PushManager.subscribe() returned (the push service address + keys)
--   role                     the workspace the browser turned it on in (a browser can be logged in as several roles)
-- A row is removed when the user turns it off, logs out of that role, or the push service says it is gone (404 / 410).

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    role VARCHAR(40) NOT NULL,
    endpoint VARCHAR(600) NOT NULL,
    p256dh VARCHAR(255) NOT NULL,
    auth VARCHAR(100) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_push_endpoint_role (endpoint, role),
    INDEX idx_push_role (role),
    CONSTRAINT fk_push_subscriptions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
