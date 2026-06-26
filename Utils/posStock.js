/** Stock status helpers for POS (SRD §4.3, §6.1). */

export function getDefaultLowStockThreshold() {
  return parseInt(process.env.LOW_STOCK_THRESHOLD, 10) || 5;
}

/**
 * @param {number} quantity - on-hand qty
 * @param {number} lowStockThreshold - per-product or default
 */
export function computeStockStatus(quantity, lowStockThreshold) {
  const qty = Number(quantity) || 0;
  const threshold = Number(lowStockThreshold) || getDefaultLowStockThreshold();
  if (qty < 1) return "out_of_stock";
  if (qty <= threshold) return "low_stock";
  return "in_stock";
}

/** Line-level status when validating cart qty against available. */
export function computeLineStockStatus(availableQty, requestedQty, lowStockThreshold) {
  const available = Number(availableQty) || 0;
  const requested = Number(requestedQty) || 0;
  if (available < 1) return "out_of_stock";
  if (requested > available) return "insufficient_stock";
  return computeStockStatus(available, lowStockThreshold);
}
