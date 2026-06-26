-- Optional notes on vendor payment records
ALTER TABLE vendor_payments
  ADD COLUMN notes TEXT NULL AFTER payment_date;
