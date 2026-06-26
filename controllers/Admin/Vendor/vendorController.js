import { db, setSessionDefaults } from "../../../config/Database.js";
import { validateGSTIN } from "../../../Utils/gstValidator.js";
import { sendSuccess, sendError } from "../../../Utils/response.js";
import { respondDbError } from "../../../Utils/dbError.js";
import { hasCrudId, sqlReplacements } from "../../../Utils/crudQuery.js";
import { parseListQuery, buildLikeSearch, listResult } from "../../../Utils/listQuery.js";
import { getRecordIds, deleteSuccessMessage, deleteSuccessPayload, softDeleteByIds } from "../../../Utils/bulkDelete.js";

async function getVendorBalance(vendorId) {
  const [[orders]] = await db.query(
    `SELECT COALESCE(SUM(total_value),0) AS total_payable FROM vendor_orders WHERE vendor_id = ? AND status = 1`,
    { replacements: [vendorId] }
  );
  const [[payments]] = await db.query(
    `SELECT COALESCE(SUM(amount),0) AS paid FROM vendor_payments WHERE vendor_id = ?`,
    { replacements: [vendorId] }
  );
  const total = Number(orders.total_payable);
  const paid = Number(payments.paid);
  return { total_payable: total, paid_amount: paid, pending_amount: total - paid };
}

export const addVendor = async (req, res) => {
  try {
    await setSessionDefaults();
    const { vendor_name, address, email, phone, gst_number, vendor_code } = req.body;
    if (!vendor_name || !vendor_code) return sendError(res, "vendor_name and vendor_code required");
    if (gst_number) {
      const v = validateGSTIN(gst_number);
      if (!v.valid) return sendError(res, v.message);
    }
    const nullIfEmpty = (v) => (v === undefined || v === null || v === "" ? null : v);
    const [id] = await db.query(
      `INSERT INTO vendors (vendor_name, address, email, phone, gst_number, vendor_code) VALUES (?,?,?,?,?,?)`,
      {
        replacements: [
          vendor_name.trim(),
          nullIfEmpty(address),
          nullIfEmpty(email),
          nullIfEmpty(phone),
          nullIfEmpty(gst_number),
          vendor_code.trim(),
        ],
      }
    );
    return sendSuccess(res, "Vendor created", { id });
  } catch (error) {
    if (error.original?.code === "ER_DUP_ENTRY") return sendError(res, "Vendor code already exists");
    return sendError(res, error.message, 500);
  }
};

export const getVendors = async (req, res) => {
  if (hasCrudId(req)) return getVendorById(req, res);
  try {
    const { page, limit, offset, search } = parseListQuery(req.query, { defaultLimit: 20 });
    let where = "WHERE status != 0";
    const params = [];
    const searchPart = buildLikeSearch(
      ["vendor_name", "vendor_code", "phone", "gst_number", "email"],
      search
    );
    where += searchPart.clause;
    params.push(...searchPart.params);

    const [vendors] = await db.query(
      `SELECT * FROM vendors ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      { replacements: [...params, limit, offset] }
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM vendors ${where}`,
      { replacements: params }
    );
    return sendSuccess(res, "Vendors fetched", listResult(vendors, { page, limit, total }));
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const getVendorById = async (req, res) => {
  const [[vendor]] = await db.query(`SELECT * FROM vendors WHERE id = ? AND status != 0`, {
    replacements: [req.query.id],
  });
  if (!vendor) return sendError(res, "Vendor not found", 404);
  const balance = await getVendorBalance(vendor.id);
  return sendSuccess(res, "Vendor detail", { ...vendor, ...balance });
};

export const updateVendor = async (req, res) => {
  try {
    const { vendor_name, address, email, phone, gst_number, vendor_code, status } = req.body;
    if (gst_number) {
      const v = validateGSTIN(gst_number);
      if (!v.valid) return sendError(res, v.message);
    }
    await db.query(
      `UPDATE vendors SET vendor_name=COALESCE(?,vendor_name), address=COALESCE(?,address),
       email=COALESCE(?,email), phone=COALESCE(?,phone), gst_number=COALESCE(?,gst_number),
       vendor_code=COALESCE(?,vendor_code), status=COALESCE(?,status) WHERE id=?`,
      {
        replacements: sqlReplacements(
          vendor_name, address, email, phone, gst_number, vendor_code, status, req.params.id
        ),
      }
    );
    return sendSuccess(res, "Vendor updated");
  } catch (error) {
    return respondDbError(res, error, "Failed to update vendor");
  }
};

export const deleteVendor = async (req, res) => {
  try {
    const ids = getRecordIds(req);
    await softDeleteByIds("vendors", ids);
    return sendSuccess(res, deleteSuccessMessage(ids.length), deleteSuccessPayload(ids));
  } catch (error) {
    return respondDbError(res, error, "Failed to delete vendor");
  }
};

export const checkUniqueCode = async (req, res) => {
  const { vendor_code, exclude_id } = req.body;
  let q = `SELECT id FROM vendors WHERE vendor_code = ? AND status != 0`;
  const params = [vendor_code];
  if (exclude_id) { q += ` AND id != ?`; params.push(exclude_id); }
  const [rows] = await db.query(q, { replacements: params });
  return sendSuccess(res, "Checked", { unique: rows.length === 0 });
};

export const checkUniqueGst = async (req, res) => {
  const { gst_number, exclude_id } = req.body;
  let q = `SELECT id FROM vendors WHERE gst_number = ? AND status != 0`;
  const params = [gst_number];
  if (exclude_id) { q += ` AND id != ?`; params.push(exclude_id); }
  const [rows] = await db.query(q, { replacements: params });
  return sendSuccess(res, "Checked", { unique: rows.length === 0 });
};

export const getVendorDropdown = async (req, res) => {
  const [rows] = await db.query(
    `SELECT id, vendor_name, vendor_code FROM vendors WHERE status = 1 ORDER BY vendor_name`
  );
  return sendSuccess(res, "Vendor dropdown", rows);
};

export const getVendorBalanceEndpoint = async (req, res) => {
  const vendorId = req.crudId ?? req.params?.id ?? req.query?.id;
  const [[vendor]] = await db.query(`SELECT id, vendor_name FROM vendors WHERE id = ? AND status != 0`, {
    replacements: [vendorId],
  });
  if (!vendor) return sendError(res, "Vendor not found", 404);

  const balance = await getVendorBalance(vendorId);
  const [orders] = await db.query(
    `SELECT * FROM vendor_orders WHERE vendor_id = ? ORDER BY order_date DESC`,
    { replacements: [vendorId] }
  );
  const [payments] = await db.query(
    `SELECT * FROM vendor_payments WHERE vendor_id = ? ORDER BY payment_date DESC`,
    { replacements: [vendorId] }
  );
  return sendSuccess(res, "Vendor balance", {
    vendor_id: vendor.id,
    vendor_name: vendor.vendor_name,
    ...balance,
    orders,
    payments,
  });
};

export const getAllVendorBalanceSummary = async (req, res) => {
  const [vendors] = await db.query(`SELECT id, vendor_name FROM vendors WHERE status = 1`);
  const summary = [];
  let totalPending = 0;
  for (const v of vendors) {
    const bal = await getVendorBalance(v.id);
    summary.push({ ...v, ...bal });
    totalPending += bal.pending_amount;
  }
  return sendSuccess(res, "Balance summary", { total_pending: totalPending, vendors: summary });
};
