-- Applied by: npm run migrate:schema-updates
-- (script creates DB if needed, runs 001 when empty, then conditional ALTERs)

-- daily_reset_counter: add auto id
ALTER TABLE daily_reset_counter DROP PRIMARY KEY;
ALTER TABLE daily_reset_counter
  ADD COLUMN id INT AUTO_INCREMENT PRIMARY KEY FIRST,
  ADD UNIQUE KEY uk_counter_date (counter_date);

-- customer_credit_wallet: add auto id
ALTER TABLE customer_credit_wallet DROP PRIMARY KEY;
ALTER TABLE customer_credit_wallet
  ADD COLUMN id INT AUTO_INCREMENT PRIMARY KEY FIRST,
  ADD UNIQUE KEY uk_credit_wallet_customer (customer_id);

-- transactions: status, created by, created at
ALTER TABLE transactions
  ADD COLUMN status TINYINT NOT NULL DEFAULT 1 AFTER line_total,
  ADD COLUMN createdby INT NULL AFTER status,
  ADD COLUMN createdon DATETIME DEFAULT CURRENT_TIMESTAMP AFTER createdby,
  ADD CONSTRAINT fk_transactions_createdby FOREIGN KEY (createdby) REFERENCES users(id);
