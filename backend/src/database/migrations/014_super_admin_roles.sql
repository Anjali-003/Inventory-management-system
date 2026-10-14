-- ADMIN -> SUPER_ADMIN, plus fields needed to manage many super admins safely.
UPDATE users SET role = 'SUPER_ADMIN' WHERE role = 'ADMIN';

ALTER TABLE users
  ALTER COLUMN role SET DEFAULT 'SUPER_ADMIN',
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE AFTER role,
  ADD COLUMN created_by INT NULL AFTER is_active,
  ADD CONSTRAINT fk_users_created_by FOREIGN KEY (created_by) REFERENCES users(id);
