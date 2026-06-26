-- Enforce unique product_name (same pattern as stock_no)
ALTER TABLE products ADD UNIQUE KEY uk_product_name (product_name);
