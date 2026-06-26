USE chettinad_thari;

CREATE TABLE IF NOT EXISTS product_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  parent_id INT NULL,
  status TINYINT DEFAULT 1,
  createdon DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedon DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES product_categories(id) ON DELETE RESTRICT,
  UNIQUE KEY uk_category_parent_name (parent_id, name)
);

ALTER TABLE products
  ADD COLUMN category_id INT NULL;

ALTER TABLE products
  ADD CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES product_categories(id);
