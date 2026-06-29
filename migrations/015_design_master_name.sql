-- Display name for design master records
ALTER TABLE design_master
  ADD COLUMN name VARCHAR(255) NULL AFTER design_code;
