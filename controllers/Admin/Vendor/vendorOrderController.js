import { db, setSessionDefaults } from "../../../config/Database.js";
import { sendSuccess, sendError } from "../../../Utils/response.js";
import { hasCrudId, getCrudId } from "../../../Utils/crudQuery.js";
import { parseListQuery, buildLikeSearch, listResult } from "../../../Utils/listQuery.js";
import { getRecordIds, deleteSuccessMessage, deleteSuccessPayload, softDeleteByIds } from "../../../Utils/bulkDelete.js";

function orderDateFilter(from, to, alias = "vo") {
  if (from && to) {
    return { clause: ` AND ${alias}.order_date BETWEEN ? AND ?`, params: [from, to] };
  }
  return { clause: "", params: [] };
}

const VENDOR_MAP_SELECT = `
  v.id AS vendor_id,
  v.vendor_name,
  v.vendor_code,
  COALESCE(SUM(vo.no_of_packages), 0) AS total_packages,
  COALESCE(SUM(vo.no_of_items), 0) AS total_items,
  COALESCE(SUM(vo.total_value), 0) AS total_amount,
  COALESCE(pay.paid_amount, 0) AS paid_amount,
  COALESCE(SUM(vo.total_value), 0) - COALESCE(pay.paid_amount, 0) AS pending_amount`;

const VENDOR_ORDER_FIELDS = `
  vo.id, vo.bill_no, vo.order_date, vo.no_of_packages, vo.no_of_items,
  vo.total_value, vo.gst_amount, vo.status, vo.createdon`;

async function fetchOrdersGroupedByVendor(vendorIds, date) {
  if (!vendorIds.length) return new Map();

  const placeholders = vendorIds.map(() => "?").join(",");
  const [orders] = await db.query(
    `SELECT vo.vendor_id, ${VENDOR_ORDER_FIELDS}
     FROM vendor_orders vo
     WHERE vo.vendor_id IN (${placeholders}) AND vo.status = 1${date.clause}
     ORDER BY vo.order_date DESC, vo.id DESC`,
    { replacements: [...vendorIds, ...date.params] }
  );

  const grouped = new Map();
  for (const { vendor_id, ...order } of orders) {
    if (!grouped.has(vendor_id)) grouped.set(vendor_id, []);
    grouped.get(vendor_id).push(order);
  }
  return grouped;
}

export const getVendorOrdersVendorsMap = async (req, res) => {
  if (hasCrudId(req)) return getVendorOrdersVendorsMapDetail(req, res);

  try {
    const { page, limit, offset, search } = parseListQuery(req.query, { defaultLimit: 20 });
    const { from, to } = req.query;
    const date = orderDateFilter(from, to);

    let where = "WHERE v.status = 1";
    const params = [...date.params];
    const searchPart = buildLikeSearch(["v.vendor_name", "v.vendor_code"], search);
    where += searchPart.clause;
    params.push(...searchPart.params);

    const joinOrders = `LEFT JOIN vendor_orders vo ON vo.vendor_id = v.id AND vo.status = 1${date.clause}`;

    const [rows] = await db.query(
      `SELECT ${VENDOR_MAP_SELECT}
       FROM vendors v
       ${joinOrders}
       LEFT JOIN (
         SELECT vendor_id, SUM(amount) AS paid_amount FROM vendor_payments GROUP BY vendor_id
       ) pay ON pay.vendor_id = v.id
       ${where}
       GROUP BY v.id, v.vendor_name, v.vendor_code, pay.paid_amount
       ORDER BY v.vendor_name ASC
       LIMIT ? OFFSET ?`,
      { replacements: [...params, limit, offset] }
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(DISTINCT v.id) AS total
       FROM vendors v
       ${joinOrders}
       ${where}`,
      { replacements: params }
    );

    const ordersByVendor = await fetchOrdersGroupedByVendor(
      rows.map((row) => row.vendor_id),
      date
    );
    const rowsWithOrders = rows.map((row) => ({
      ...row,
      orders: ordersByVendor.get(row.vendor_id) ?? [],
    }));

    return sendSuccess(res, "Vendor orders map", listResult(rowsWithOrders, { page, limit, total }));
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const getVendorOrdersVendorsMapDetail = async (req, res) => {
  try {
    const vendorId = getCrudId(req);
    const [[vendor]] = await db.query(
      `SELECT id, vendor_name, vendor_code FROM vendors WHERE id = ? AND status != 0`,
      { replacements: [vendorId] }
    );
    if (!vendor) return sendError(res, "Vendor not found", 404);

    const { page, limit, offset, search } = parseListQuery(req.query, { defaultLimit: 20 });
    const { from, to } = req.query;
    const date = orderDateFilter(from, to);

    const [[summary]] = await db.query(
      `SELECT ${VENDOR_MAP_SELECT}
       FROM vendors v
       LEFT JOIN vendor_orders vo ON vo.vendor_id = v.id AND vo.status = 1${date.clause}
       LEFT JOIN (
         SELECT vendor_id, SUM(amount) AS paid_amount FROM vendor_payments GROUP BY vendor_id
       ) pay ON pay.vendor_id = v.id
       WHERE v.id = ?
       GROUP BY v.id, v.vendor_name, v.vendor_code, pay.paid_amount`,
      { replacements: [...date.params, vendorId] }
    );

    let orderWhere = "WHERE vo.vendor_id = ? AND vo.status = 1";
    const orderParams = [vendorId, ...date.params];
    orderWhere += date.clause;
    const searchPart = buildLikeSearch(["vo.bill_no"], search);
    orderWhere += searchPart.clause;
    orderParams.push(...searchPart.params);

    const [orders] = await db.query(
      `SELECT ${VENDOR_ORDER_FIELDS}
       FROM vendor_orders vo
       ${orderWhere}
       ORDER BY vo.order_date DESC, vo.id DESC
       LIMIT ? OFFSET ?`,
      { replacements: [...orderParams, limit, offset] }
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM vendor_orders vo ${orderWhere}`,
      { replacements: orderParams }
    );

    return sendSuccess(res, "Vendor orders map detail", {
      vendor_id: vendor.id,
      vendor_name: vendor.vendor_name,
      vendor_code: vendor.vendor_code,
      total_packages: Number(summary?.total_packages ?? 0),
      total_items: Number(summary?.total_items ?? 0),
      total_amount: Number(summary?.total_amount ?? 0),
      paid_amount: Number(summary?.paid_amount ?? 0),
      pending_amount: Number(summary?.pending_amount ?? 0),
      orders: listResult(orders, { page, limit, total }),
    });
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const addVendorOrder = async (req, res) => {
  try {
    await setSessionDefaults();
    const { vendor_id, bill_no, order_date, no_of_packages, no_of_items, total_value, gst_amount = 0 } = req.body;
    const [id] = await db.query(
      `INSERT INTO vendor_orders (vendor_id, bill_no, order_date, no_of_packages, no_of_items, total_value, gst_amount, createdby)
       VALUES (?,?,?,?,?,?,?,?)`,
      {
        replacements: [
          vendor_id, bill_no, order_date, no_of_packages || 0, no_of_items || 0,
          total_value, gst_amount, req.user?.id,
        ],
      }
    );
    return sendSuccess(res, "Vendor order created", { id });
  } catch (error) {
    if (error.original?.code === "ER_DUP_ENTRY") return sendError(res, "Bill number already exists for vendor");
    return sendError(res, error.message, 500);
  }
};

export const getVendorOrders = async (req, res) => {
  if (hasCrudId(req)) return getVendorOrderById(req, res);
  try {
    const { page, limit, offset, search } = parseListQuery(req.query, { defaultLimit: 20 });
    const { vendor_id, from, to } = req.query;
    let where = "WHERE vo.status = 1";
    const params = [];
    if (vendor_id) { where += " AND vo.vendor_id = ?"; params.push(vendor_id); }
    if (from && to) { where += " AND vo.order_date BETWEEN ? AND ?"; params.push(from, to); }
    const searchPart = buildLikeSearch(
      ["vo.bill_no", "v.vendor_name", "v.vendor_code"],
      search
    );
    where += searchPart.clause;
    params.push(...searchPart.params);

    const [rows] = await db.query(
      `SELECT vo.*, v.vendor_name, v.vendor_code FROM vendor_orders vo
       JOIN vendors v ON v.id = vo.vendor_id ${where}
       ORDER BY vo.order_date DESC LIMIT ? OFFSET ?`,
      { replacements: [...params, limit, offset] }
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM vendor_orders vo
       JOIN vendors v ON v.id = vo.vendor_id ${where}`,
      { replacements: params }
    );
    return sendSuccess(res, "Vendor orders", listResult(rows, { page, limit, total }));
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const getVendorOrderById = async (req, res) => {
  const [[row]] = await db.query(
    `SELECT vo.*, v.vendor_name FROM vendor_orders vo JOIN vendors v ON v.id = vo.vendor_id WHERE vo.id = ?`,
    { replacements: [req.query.id] }
  );
  if (!row) return sendError(res, "Vendor order not found", 404);
  return sendSuccess(res, "Vendor order fetched", row);
};

export const updateVendorOrder = async (req, res) => {
  const fields = ["bill_no", "order_date", "no_of_packages", "no_of_items", "total_value", "gst_amount", "status"];
  const updates = [];
  const params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); }
  }
  if (!updates.length) return sendError(res, "No fields to update");
  params.push(req.recordId ?? req.params.id);
  await db.query(`UPDATE vendor_orders SET ${updates.join(", ")} WHERE id = ?`, { replacements: params });
  return sendSuccess(res, "Vendor order updated");
};

export const deleteVendorOrder = async (req, res) => {
  try {
    const ids = getRecordIds(req);
    await softDeleteByIds("vendor_orders", ids);
    return sendSuccess(res, deleteSuccessMessage(ids.length), deleteSuccessPayload(ids));
  } catch (error) {
    return sendError(res, error.message, error.statusCode || 500);
  }
};
