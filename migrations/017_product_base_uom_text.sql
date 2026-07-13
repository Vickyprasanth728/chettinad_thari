-- Store Base UOM as plain text on products (not a master lookup)
ALTER TABLE products
  DROP FOREIGN KEY fk_products_base_uom;

ALTER TABLE products
  DROP COLUMN base_uom_id;

ALTER TABLE products
  ADD COLUMN base_uom VARCHAR(50) NULL AFTER category_id;
