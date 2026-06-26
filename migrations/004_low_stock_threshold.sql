-- Per-product low stock alert threshold (alert when quantity <= this value)
ALTER TABLE products
  ADD COLUMN low_stock_threshold INT NOT NULL DEFAULT 5 AFTER quantity;
