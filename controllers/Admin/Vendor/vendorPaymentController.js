import { db, setSessionDefaults } from "../../../config/Database.js";
import { sendSuccess, sendError } from "../../../Utils/response.js";
import { respondDbError } from "../../../Utils/dbError.js";
import { hasCrudId, sqlReplacements } from "../../../Utils/crudQuery.js";
import { parseListQuery, buildLikeSearch, listResult } from "../../../Utils/listQuery.js";
import { getRecordIds, deleteSuccessMessage, deleteSuccessPayload, hardDeleteByIds } from "../../../Utils/bulkDelete.js";

async function getPending(vendorId) {
  const [[o]] = await db.query(
    `SELECT COALESCE(SUM(total_value),0) AS t FROM vendor_orders WHERE vendor_id=? AND status=1`,
    { replacements: [vendorId] }
  );
  const [[p]] = await db.query(
    `SELECT COALESCE(SUM(amount),0) AS t FROM vendor_payments WHERE vendor_id=?`,
    { replacements: [vendorId] }
  );
  return Number(o.t) - Number(p.t);
}

export const addVendorPayment = async (req, res) => {
  try {
    await setSessionDefaults();
    const { vendor_id, vendor_order_id, amount, payment_date, notes } = req.body;
    const pending = await getPending(vendor_id);
    if (Number(amount) > pending + 0.01) {
      return sendError(res, `Payment exceeds pending balance (${pending.toFixed(2)})`);
    }
    const [id] = await db.query(
      `INSERT INTO vendor_payments (vendor_id, vendor_order_id, amount, payment_date, notes, createdby) VALUES (?,?,?,?,?,?)`,
      { replacements: [vendor_id, vendor_order_id || null, amount, payment_date, notes ?? null, req.user?.id] }
    );
    const newPending = await getPending(vendor_id);
    return sendSuccess(res, "Payment recorded", { id, pending_amount: newPending });
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const getVendorPayments = async (req, res) => {
  if (hasCrudId(req)) return getVendorPaymentById(req, res);

  try {
    const { page, limit, offset, search } = parseListQuery(req.query, { defaultLimit: 20 });
    const { vendor_id, from, to } = req.query;
    let where = "WHERE 1=1";
    const params = [];
    if (vendor_id) { where += " AND vp.vendor_id = ?"; params.push(vendor_id); }
    if (from && to) { where += " AND vp.payment_date BETWEEN ? AND ?"; params.push(from, to); }
    const searchPart = buildLikeSearch(["v.vendor_name", "v.vendor_code"], search);
    where += searchPart.clause;
    params.push(...searchPart.params);

    const [rows] = await db.query(
      `SELECT vp.*, v.vendor_name FROM vendor_payments vp
       JOIN vendors v ON v.id = vp.vendor_id ${where}
       ORDER BY vp.payment_date DESC LIMIT ? OFFSET ?`,
      { replacements: [...params, limit, offset] }
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM vendor_payments vp
       JOIN vendors v ON v.id = vp.vendor_id ${where}`,
      { replacements: params }
    );
    return sendSuccess(res, "Vendor payments", listResult(rows, { page, limit, total }));
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const getVendorPaymentById = async (req, res) => {
  const [[row]] = await db.query(`SELECT * FROM vendor_payments WHERE id = ?`, {
    replacements: [req.query.id],
  });
  if (!row) return sendError(res, "Payment not found", 404);
  return sendSuccess(res, "Payment fetched", row);
};

export const updateVendorPayment = async (req, res) => {
  try {
    const { amount, payment_date, vendor_order_id, notes } = req.body;
    await db.query(
      `UPDATE vendor_payments SET amount=COALESCE(?,amount), payment_date=COALESCE(?,payment_date),
       vendor_order_id=COALESCE(?,vendor_order_id), notes=COALESCE(?,notes) WHERE id=?`,
      { replacements: sqlReplacements(amount, payment_date, vendor_order_id, notes, req.params.id) }
    );
    return sendSuccess(res, "Payment updated");
  } catch (error) {
    return respondDbError(res, error, "Failed to update payment");
  }
};

export const deleteVendorPayment = async (req, res) => {
  try {
    const ids = getRecordIds(req);
    await hardDeleteByIds("vendor_payments", ids);
    return sendSuccess(res, deleteSuccessMessage(ids.length), deleteSuccessPayload(ids));
  } catch (error) {
    return respondDbError(res, error, "Failed to delete payment");
  }
};
