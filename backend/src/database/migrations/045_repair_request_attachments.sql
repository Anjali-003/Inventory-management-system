CREATE TABLE IF NOT EXISTS repair_attachments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  repair_id BIGINT UNSIGNED NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(40) NOT NULL,
  file_size INT UNSIGNED NOT NULL,
  file_data MEDIUMBLOB NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_repair_attachment (repair_id),
  CONSTRAINT fk_repair_attachment_request FOREIGN KEY (repair_id)
    REFERENCES repair_requests(id) ON DELETE CASCADE,
  CONSTRAINT chk_repair_attachment_size CHECK (file_size > 0 AND file_size <= 1048576)
) ENGINE=InnoDB;
