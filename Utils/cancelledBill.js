/** Sale bills with full or partial line cancellations (matches reports logic). */
export const CANCELLED_SALE_BILL_WHERE = `(
  tb.status = 'cancelled'
  OR NULLIF(TRIM(tb.cancellation_reason), '') IS NOT NULL
  OR EXISTS (
    SELECT 1 FROM transactions t0
    WHERE t0.bill_id = tb.id AND (t0.cancelled_qty > 0 OR t0.status = 0)
  )
)`;

export const CANCELLED_LINE_AMOUNT_SQL = `CASE
  WHEN t.cancelled_qty > 0 THEN ROUND(t.line_total * t.cancelled_qty / NULLIF(t.quantity, 0), 2)
  WHEN t.status = 0 THEN t.line_total
  WHEN tb.status = 'cancelled' THEN t.line_total
  ELSE 0
END`;
