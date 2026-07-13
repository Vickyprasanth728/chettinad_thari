-- Enforce unique design name (same pattern as design_code / product_name)
-- NULL names remain allowed; MySQL UNIQUE permits multiple NULLs.
ALTER TABLE design_master ADD UNIQUE KEY uk_design_master_name (name);
