CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  createdon DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_reset_token_hash (token_hash),
  KEY idx_reset_user (user_id),
  KEY idx_reset_expires (expires_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
