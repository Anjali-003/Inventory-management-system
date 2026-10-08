ALTER TABLE employees
    ADD COLUMN date_of_birth DATE NULL,
    ADD COLUMN gender VARCHAR(30) NULL,
    ADD COLUMN address TEXT NULL,
    ADD COLUMN emergency_contact_name VARCHAR(150) NULL,
    ADD COLUMN emergency_contact_relationship VARCHAR(50) NULL,
    ADD COLUMN emergency_contact_phone VARCHAR(30) NULL;