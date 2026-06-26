-- Per sale-line return tracking and link return lines to parent transactions
ALTER TABLE transactions
  ADD COLUMN returned_qty INT NOT NULL DEFAULT 0 AFTER quantity,
  ADD COLUMN cancelled_qty INT NOT NULL DEFAULT 0 AFTER returned_qty,
  ADD COLUMN parent_transaction_id INT NULL AFTER bill_id;
