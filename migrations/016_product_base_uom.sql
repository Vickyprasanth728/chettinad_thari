-- Add Base UOM reference on products (lookup from gmastervalue under gmaster "Base UOM" or "UOM")
ALTER TABLE products
  ADD COLUMN base_uom_id INT NULL AFTER category_id,
  ADD CONSTRAINT fk_products_base_uom FOREIGN KEY (base_uom_id) REFERENCES gmastervalue(id);
