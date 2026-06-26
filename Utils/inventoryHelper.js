import { db } from "../config/Database.js";

export async function logInventoryChange({
  productId,
  staffId,
  actionType,
  quantityChanged,
  beforeQty,
  afterQty,
  referenceType = null,
  referenceId = null,
  notes = null,
  transaction: t = null,
}) {
  const query = `INSERT INTO inventory_logs
    (product_id, staff_id, action_type, quantity_changed, before_qty, after_qty, reference_type, reference_id, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const replacements = [
    productId,
    staffId,
    actionType,
    quantityChanged,
    beforeQty,
    afterQty,
    referenceType,
    referenceId,
    notes,
  ];
  if (t) {
    await db.query(query, { replacements, transaction: t });
  } else {
    await db.query(query, { replacements });
  }
}

export async function adjustProductStock(productId, delta, staffId, actionType, refType, refId, t = null) {
  const conn = t || db;
  const [[product]] = await conn.query(
    `SELECT quantity FROM products WHERE id = ? FOR UPDATE`,
    { replacements: [productId] }
  );
  if (!product) throw new Error(`Product ${productId} not found`);

  const beforeQty = product.quantity;
  const afterQty = beforeQty + delta;
  if (afterQty < 0) throw new Error(`Insufficient stock for product ${productId}`);

  await conn.query(`UPDATE products SET quantity = ? WHERE id = ?`, {
    replacements: [afterQty, productId],
  });

  await logInventoryChange({
    productId,
    staffId,
    actionType,
    quantityChanged: Math.abs(delta),
    beforeQty,
    afterQty,
    referenceType: refType,
    referenceId: refId,
    transaction: t,
  });

  return afterQty;
}
