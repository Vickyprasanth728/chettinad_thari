CREATE TABLE IF NOT EXISTS print_receipt_template (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  value TEXT NOT NULL,
  createdby INT NULL,
  createdon DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedby INT NULL,
  updatedon DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_receipt_template_name (name),
  CONSTRAINT fk_receipt_template_createdby FOREIGN KEY (createdby) REFERENCES users(id),
  CONSTRAINT fk_receipt_template_updatedby FOREIGN KEY (updatedby) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
