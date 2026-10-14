-- Who did what, when. Written automatically for every successful write (POST/PUT/PATCH/DELETE) and for logins.
CREATE TABLE IF NOT EXISTS activity_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(50) NOT NULL,
    resource_id INT NULL,
    summary VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_activity_created (created_at)
);
