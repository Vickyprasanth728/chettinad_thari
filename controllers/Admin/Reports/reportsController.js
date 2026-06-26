import xlsx from "xlsx";
import { htmlToPdfBuffer, sendPdf } from "../../../Utils/pdfHelper.js";
import { buildAdminReportPdfHtml } from "../../../Utils/pdfReportHtml.js";
import { db, setSessionDefaults } from "../../../config/Database.js";
import { getCurrentISTDate } from "../../../Utils/Datetime.js";
import { sendSuccess, sendReportSuccess, sendError } from "../../../Utils/response.js";
import {
  PAYMENT_TYPE_LABELS,
  formatPaymentAmountsBreakdown,
  formatPaymentTypeNamesFromRaw,
  normalizePaymentMethod,
} from "../../../Utils/paymentMethodHelper.js";
import {
  parseReportPagination,
  slicePaginated,
  isJsonReportFormat,
} from "../../../Utils/listQuery.js";

function validateDates(from, to) {
  if (from && to && from > to) return "Invalid date range";
  return null;
}

/** Normalize query keys (supports from/to and legacy from_date/to_date). */
function normalizeReportQuery(query = {}) {
  const from = query.from || query.from_date || undefined;
  const to = query.to || query.to_date || undefined;
  const vendor_id = query.vendor_id ? Number(query.vendor_id) : undefined;
  return { ...query, from, to, vendor_id: Number.isFinite(vendor_id) ? vendor_id : undefined };
}

function buildVendorOrderDateClause(filters, params) {
  if (filters.from && filters.to) {
    params.push(filters.from, filters.to);
    return " AND order_date BETWEEN ? AND ?";
  }
  return "";
}

function buildVendorPaymentDateClause(filters, params) {
  if (filters.from && filters.to) {
    params.push(filters.from, filters.to);
    return " AND payment_date BETWEEN ? AND ?";
  }
  return "";
}

async function getVendorReport(filters = {}) {
  const orderParams = [];
  const paymentParams = [];
  const orderDateClause = buildVendorOrderDateClause(filters, orderParams);
  const paymentDateClause = buildVendorPaymentDateClause(filters, paymentParams);

  const whereParts = ["v.status = 1"];
  const vendorParams = [];

  if (filters.vendor_id) {
    whereParts.push("v.id = ?");
    vendorParams.push(filters.vendor_id);
  }
  if (filters.vendor_name) {
    whereParts.push("v.vendor_name LIKE ?");
    vendorParams.push(`%${filters.vendor_name}%`);
  }

  const [rows] = await db.query(
    `SELECT v.id AS id, v.id AS vendor_id, v.vendor_name,
            COALESCE((
              SELECT SUM(total_value) FROM vendor_orders
              WHERE vendor_id = v.id AND status = 1${orderDateClause}
            ), 0) AS total_purchase,
            COALESCE((
              SELECT SUM(amount) FROM vendor_payments
              WHERE vendor_id = v.id${paymentDateClause}
            ), 0) AS paid_amount
     FROM vendors v
     WHERE ${whereParts.join(" AND ")}
     ORDER BY v.vendor_name ASC`,
    { replacements: [...orderParams, ...paymentParams, ...vendorParams] }
  );

  let result = rows.map((r) => ({
    ...r,
    transactions: [],
    pending_amount: Number(r.total_purchase) - Number(r.paid_amount),
  }));

  const pendingOnly =
    filters.pending_only === "1" ||
    filters.pending_only === "true" ||
    filters.pending_only === true;
  if (pendingOnly) {
    result = result.filter((r) => Number(r.pending_amount) > 0);
  }

  return result;
}

function buildBillWhere(filters, params) {
  let where = `WHERE tb.bill_type = 'sale' AND tb.status = 'completed'`;
  if (filters.from && filters.to) {
    where += ` AND DATE(tb.createdon) BETWEEN ? AND ?`;
    params.push(filters.from, filters.to);
  }
  if (filters.product) {
    where += ` AND p.product_name LIKE ?`;
    params.push(`%${filters.product}%`);
  }
  if (filters.bill_number) {
    where += ` AND tb.bill_no LIKE ?`;
    params.push(`%${filters.bill_number}%`);
  }
  if (filters.staff_id) {
    where += ` AND tb.staff_id = ?`;
    params.push(filters.staff_id);
  }
  if (filters.payment_type) {
    where += ` AND EXISTS (SELECT 1 FROM split_payments sp WHERE sp.bill_id=tb.id AND sp.payment_method=?)`;
    params.push(filters.payment_type);
  }
  return where;
}

const CANCELLED_BILL_EXISTS = `(
  tb.status = 'cancelled'
  OR NULLIF(TRIM(tb.cancellation_reason), '') IS NOT NULL
  OR EXISTS (
    SELECT 1 FROM transactions t0
    WHERE t0.bill_id = tb.id AND (t0.cancelled_qty > 0 OR t0.status = 0)
  )
)`;

function buildCancelledBillWhere(filters, params) {
  let where = `WHERE tb.bill_type = 'sale' AND ${CANCELLED_BILL_EXISTS}`;
  if (filters.from && filters.to) {
    where += ` AND DATE(tb.createdon) BETWEEN ? AND ?`;
    params.push(filters.from, filters.to);
  }
  if (filters.product) {
    where += ` AND EXISTS (
      SELECT 1 FROM transactions tx
      JOIN products px ON px.id = tx.product_id
      WHERE tx.bill_id = tb.id
        AND px.product_name LIKE ?
        AND (tx.cancelled_qty > 0 OR tx.status = 0 OR tb.status = 'cancelled')
    )`;
    params.push(`%${filters.product}%`);
  }
  if (filters.bill_number) {
    where += ` AND tb.bill_no LIKE ?`;
    params.push(`%${filters.bill_number}%`);
  }
  if (filters.staff_id) {
    where += ` AND tb.staff_id = ?`;
    params.push(filters.staff_id);
  }
  if (filters.payment_type) {
    where += ` AND EXISTS (SELECT 1 FROM split_payments sp WHERE sp.bill_id=tb.id AND sp.payment_method=?)`;
    params.push(filters.payment_type);
  }
  return where;
}

function mapReportTransaction(row) {
  const quantity = Number(row.quantity) || 0;
  const returnedQty = Number(row.returned_qty) || 0;
  const cancelledQty = Number(row.cancelled_qty) || 0;
  let cancelledAmount = 0;
  if (cancelledQty > 0 && quantity > 0) {
    cancelledAmount = Math.round((Number(row.line_total) * cancelledQty) / quantity * 100) / 100;
  } else if (Number(row.status) === 0) {
    cancelledAmount = Number(row.line_total) || 0;
  }

  return {
    id: row.id,
    product_id: row.product_id,
    product_name: row.product_name,
    stock_no: row.stock_no,
    quantity,
    cancelled_qty: cancelledQty,
    returned_qty: returnedQty,
    remaining_qty: Math.max(quantity - returnedQty - cancelledQty, 0),
    unit_price: row.unit_price,
    discount: row.discount,
    gst_rate: row.gst_rate,
    gst_amount: row.gst_amount,
    cgst: row.cgst,
    sgst: row.sgst,
    igst: row.igst,
    line_total: row.line_total,
    cancelled_amount: cancelledAmount,
    status: row.status,
    line_status: row.line_status,
  };
}

async function fetchBillTransactions(billIds) {
  if (!billIds.length) return {};

  const [txRows] = await db.query(
    `SELECT t.id,
            t.bill_id,
            t.product_id,
            p.product_name,
            t.stock_no,
            t.quantity,
            t.cancelled_qty,
            t.returned_qty,
            t.unit_price,
            t.discount,
            g.tax AS gst_rate,
            t.gst_amount,
            t.cgst,
            t.sgst,
            t.igst,
            t.line_total,
            t.status,
            CASE
              WHEN t.status = 0 THEN 'cancelled'
              WHEN t.status = 2 THEN 'returned'
              ELSE 'active'
            END AS line_status
     FROM transactions t
     JOIN products p ON p.id = t.product_id
     LEFT JOIN gst g ON g.id = t.gst_id
     WHERE t.bill_id IN (?)
     ORDER BY t.id ASC`,
    { replacements: [billIds] }
  );

  return txRows.reduce((acc, row) => {
    const billId = row.bill_id;
    if (!acc[billId]) acc[billId] = [];
    acc[billId].push(mapReportTransaction(row));
    return acc;
  }, {});
}

async function enrichBillRowsWithTransactions(rows) {
  const billIds = rows.map((row) => row.id).filter((id) => id != null);
  const txByBill = await fetchBillTransactions(billIds);
  return rows.map((row) => ({
    ...row,
    transactions: txByBill[row.id] || [],
  }));
}

const BILL_DETAILS_FROM = `
FROM transaction_billing tb
LEFT JOIN split_payments sp ON sp.bill_id = tb.id
LEFT JOIN transactions t ON t.bill_id = tb.id
LEFT JOIN products p ON p.id = t.product_id`;

const IN_DEPTH_FROM = `
FROM transaction_billing tb
JOIN transactions t ON t.bill_id = tb.id
JOIN products p ON p.id = t.product_id
LEFT JOIN split_payments sp ON sp.bill_id = tb.id
LEFT JOIN users u ON u.id = tb.staff_id`;

const CANCELLED_BILL_FROM = `
FROM transaction_billing tb
JOIN transactions t ON t.bill_id = tb.id
JOIN products p ON p.id = t.product_id
LEFT JOIN split_payments sp ON sp.bill_id = tb.id
LEFT JOIN users u ON u.id = tb.staff_id
LEFT JOIN billing_customers bc ON bc.id = tb.customer_id`;

const DAILY_REPORT_FROM = `
FROM transaction_billing tb
LEFT JOIN users u ON u.id = tb.staff_id
LEFT JOIN transaction_billing parent_tb ON parent_tb.id = tb.parent_bill_id`;

const DAILY_BILL_PRODUCTS_SUBQUERY = `(
  SELECT GROUP_CONCAT(DISTINCT p.product_name ORDER BY p.product_name SEPARATOR ', ')
  FROM transactions t
  JOIN products p ON p.id = t.product_id
  WHERE t.bill_id = tb.id
)`;

const DAILY_BILL_STOCK_NOS_SUBQUERY = `(
  SELECT GROUP_CONCAT(DISTINCT t.stock_no ORDER BY t.stock_no SEPARATOR ', ')
  FROM transactions t
  WHERE t.bill_id = tb.id AND NULLIF(TRIM(t.stock_no), '') IS NOT NULL
)`;

const DAILY_BILL_RETURN_QTY_SUBQUERY = `(
  SELECT COALESCE(SUM(t.quantity), 0)
  FROM transactions t
  WHERE t.bill_id = tb.id
)`;

const DAILY_BILL_PARTIAL_CANCELS_SUBQUERY = `(
  SELECT GROUP_CONCAT(
    DISTINCT CONCAT(
      p.product_name, ': ',
      CASE
        WHEN t.cancelled_qty > 0 THEN CONCAT(t.cancelled_qty, '/', t.quantity, ' qty cancelled')
        WHEN t.status = 0 THEN 'line cancelled'
        ELSE NULL
      END
    )
    ORDER BY p.product_name SEPARATOR '; '
  )
  FROM transactions t
  JOIN products p ON p.id = t.product_id
  WHERE t.bill_id = tb.id AND (t.cancelled_qty > 0 OR t.status = 0)
)`;

const DAILY_BILL_LINKED_RETURNS_SUBQUERY = `(
  SELECT GROUP_CONCAT(
    DISTINCT CONCAT('Return ', rb.bill_no, ' (', DATE(rb.createdon), ')')
    ORDER BY rb.createdon SEPARATOR '; '
  )
  FROM transaction_billing rb
  WHERE rb.bill_type = 'return'
    AND rb.status = 'completed'
    AND rb.parent_bill_id = tb.id
)`;

const DAILY_PAYMENT_SUBQUERY = `TRIM(BOTH '|' FROM CONCAT_WS('|',
  (
    SELECT GROUP_CONCAT(
      CONCAT(sp.payment_method, ':', ROUND(sp.amount, 2))
      ORDER BY sp.id SEPARATOR '|'
    )
    FROM split_payments sp
    WHERE sp.bill_id = tb.id
  ),
  IF(COALESCE(tb.credit_applied, 0) > 0, CONCAT('credit:', ROUND(tb.credit_applied, 2)), NULL)
))`;

function normalizeDailyReportQuery(query = {}) {
  const singleDate = query.date ? String(query.date).trim() : undefined;
  const from = query.from || query.from_date || singleDate || undefined;
  const to = query.to || query.to_date || singleDate || undefined;
  const stock_no = query.stock_no || query.stock_name || undefined;
  const product_id = query.product_id ? Number(query.product_id) : undefined;
  const bill_number = query.bill_number || query.bill_no || undefined;
  const staff_id = query.staff_id ? Number(query.staff_id) : undefined;
  const vendor_id = query.vendor_id ? Number(query.vendor_id) : undefined;
  const paymentRaw = query.payment_type ? normalizePaymentMethod(query.payment_type) : undefined;

  return {
    ...query,
    from,
    to,
    stock_no: stock_no ? String(stock_no).trim() : undefined,
    product_id: Number.isFinite(product_id) ? product_id : undefined,
    bill_number: bill_number ? String(bill_number).trim() : undefined,
    staff_id: Number.isFinite(staff_id) ? staff_id : undefined,
    vendor_id: Number.isFinite(vendor_id) ? vendor_id : undefined,
    payment_type: paymentRaw || undefined,
  };
}

function buildDailyReportWhere(filters, params) {
  let where = `WHERE (
    (tb.bill_type = 'sale' AND tb.status IN ('completed', 'cancelled'))
    OR (tb.bill_type = 'return' AND tb.status = 'completed')
  )`;
  if (filters.from && filters.to) {
    where += ` AND DATE(tb.createdon) BETWEEN ? AND ?`;
    params.push(filters.from, filters.to);
  }
  if (filters.stock_no) {
    where += ` AND EXISTS (
      SELECT 1 FROM transactions tx
      WHERE tx.bill_id = tb.id AND tx.stock_no LIKE ?
    )`;
    params.push(`%${filters.stock_no}%`);
  }
  if (filters.product_id) {
    where += ` AND EXISTS (
      SELECT 1 FROM transactions tx
      WHERE tx.bill_id = tb.id AND tx.product_id = ?
    )`;
    params.push(filters.product_id);
  }
  if (filters.vendor_id) {
    where += ` AND EXISTS (
      SELECT 1 FROM transactions tx
      JOIN products px ON px.id = tx.product_id
      WHERE tx.bill_id = tb.id AND px.vendor_id = ?
    )`;
    params.push(filters.vendor_id);
  }
  if (filters.staff_id) {
    where += ` AND tb.staff_id = ?`;
    params.push(filters.staff_id);
  }
  if (filters.bill_number) {
    where += ` AND tb.bill_no LIKE ?`;
    params.push(`%${filters.bill_number}%`);
  }
  if (filters.payment_type) {
    if (filters.payment_type === "credit") {
      where += ` AND COALESCE(tb.credit_applied, 0) > 0`;
    } else {
      where += ` AND EXISTS (
        SELECT 1 FROM split_payments spf
        WHERE spf.bill_id = tb.id AND spf.payment_method = ?
      )`;
      params.push(filters.payment_type);
    }
  }
  return where;
}

function buildDailyReportCancelledHistory(row) {
  const billNo = row.bill_no || "—";
  const reason = String(row.cancellation_reason || "").trim();

  if (row.bill_type === "return") {
    const parentBillNo = row.parent_bill_no || "—";
    const qty = Number(row.return_qty) || 0;
    return `Return against ${parentBillNo} (qty ${qty})`;
  }

  if (row.bill_status === "cancelled") {
    return `Full cancel (${billNo}): ${reason || "Bill cancelled"}`;
  }

  const parts = [];
  if (row.partial_cancels) parts.push(row.partial_cancels);
  if (row.linked_returns) parts.push(row.linked_returns);
  if (reason && parts.length === 0) {
    parts.push(`Note (${billNo}): ${reason}`);
  }
  return parts.join("; ");
}

function resolveDailyReportPaymentRaw(row) {
  const raw = String(row.payment_raw || "").trim();
  if (raw) return raw;

  if (row.bill_type === "return") {
    const amount = Number(row.bill_total) || 0;
    if (amount > 0) return `credit:${amount.toFixed(2)}`;
  }

  return "";
}

function mapDailyReportRow(row, sNo) {
  const paymentRaw = resolveDailyReportPaymentRaw(row);
  return {
    s_no: sNo,
    bill_no: row.bill_no,
    date: row.date,
    product_name: row.product_name || "",
    stock_no: row.stock_no || "",
    staff_name: row.staff_name || "—",
    cancelled_bill_history: buildDailyReportCancelledHistory(row),
    payment_type_name: formatPaymentTypeNamesFromRaw(paymentRaw) || "",
    payment_amounts: formatPaymentAmountsBreakdown(paymentRaw) || "",
    bill_total: row.bill_total,
  };
}

async function getDailyReportRows(filters, pagination) {
  const params = [];
  const where = buildDailyReportWhere(filters, params);

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total ${DAILY_REPORT_FROM} ${where}`,
    { replacements: params }
  );
  const count = Number(total) || 0;

  let sql = `SELECT tb.id AS bill_id,
              DATE(tb.createdon) AS date,
              tb.bill_no,
              tb.bill_type,
              tb.status AS bill_status,
              tb.cancellation_reason,
              tb.total AS bill_total,
              parent_tb.bill_no AS parent_bill_no,
              u.name AS staff_name,
              ${DAILY_BILL_PRODUCTS_SUBQUERY} AS product_name,
              ${DAILY_BILL_STOCK_NOS_SUBQUERY} AS stock_no,
              ${DAILY_BILL_RETURN_QTY_SUBQUERY} AS return_qty,
              ${DAILY_BILL_PARTIAL_CANCELS_SUBQUERY} AS partial_cancels,
              ${DAILY_BILL_LINKED_RETURNS_SUBQUERY} AS linked_returns,
              ${DAILY_PAYMENT_SUBQUERY} AS payment_raw
       ${DAILY_REPORT_FROM}
       ${where}
       ORDER BY tb.createdon ASC, tb.id ASC`;

  const queryParams = [...params];
  if (pagination && isJsonReportFormat(filters.format)) {
    sql += " LIMIT ? OFFSET ?";
    queryParams.push(pagination.limit, pagination.offset);
  }

  const [rows] = await db.query(sql, { replacements: queryParams });
  const startNo = pagination ? pagination.offset + 1 : 1;
  const data = rows.map((row, index) => mapDailyReportRow(row, startNo + index));
  return { data, count };
}

async function countDistinctBills(where, params, fromClause) {
  const [[{ total }]] = await db.query(
    `SELECT COUNT(DISTINCT tb.id) AS total ${fromClause} ${where}`,
    { replacements: params }
  );
  return Number(total) || 0;
}

async function respondBillReport(res, rows, format, filename, pdfMeta = {}, count = null, pagination = null) {
  const data = await enrichBillRowsWithTransactions(rows);
  const total = count != null ? count : data.length;
  if (isJsonReportFormat(format)) {
    return sendReportSuccess(res, "Report data", data, total, pagination);
  }
  const flatRows = data.map(({ transactions, ...rest }) => rest);
  return exportOrJson(res, flatRows, format, filename, pdfMeta);
}

export const vendorReport = async (req, res) => {
  try {
    const filters = normalizeReportQuery(req.query);
    const err = validateDates(filters.from, filters.to);
    if (err) return sendError(res, err);
    const pagination = parseReportPagination(filters);
    const data = await getVendorReport(filters);
    const total = data.length;
    const pageData = slicePaginated(data, pagination);
    if (isJsonReportFormat(filters.format)) {
      return sendReportSuccess(res, "Report data", pageData, total, pagination);
    }
    const flatRows = data.map(({ transactions, ...rest }) => rest);
    return exportOrJson(res, flatRows, filters.format, "vendor_report", {
      from: filters.from,
      to: filters.to,
    });
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const inDepthReport = async (req, res) => {
  try {
    const filters = req.query;
    const err = validateDates(filters.from, filters.to);
    if (err) return sendError(res, err);
    const pagination = parseReportPagination(filters);
    const params = [];
    const where = buildBillWhere(filters, params);
    const count = await countDistinctBills(where, params, IN_DEPTH_FROM);

    let sql = `SELECT tb.id AS id, DATE(tb.createdon) AS date, tb.bill_no, GROUP_CONCAT(p.product_name) AS items_billed,
              GROUP_CONCAT(DISTINCT sp.payment_method) AS payment_type, u.name AS staff
       ${IN_DEPTH_FROM}
       ${where} GROUP BY tb.id ORDER BY tb.createdon DESC`;
    const queryParams = [...params];
    if (pagination && isJsonReportFormat(filters.format)) {
      sql += " LIMIT ? OFFSET ?";
      queryParams.push(pagination.limit, pagination.offset);
    }
    const [rows] = await db.query(sql, { replacements: queryParams });
    return respondBillReport(res, rows, filters.format, "in_depth_report", {
      from: filters.from,
      to: filters.to,
    }, count, pagination);
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const billDetailsReport = async (req, res) => {
  try {
    const filters = req.query;
    const pagination = parseReportPagination(filters);
    const params = [];
    const where = buildBillWhere(filters, params);
    const count = await countDistinctBills(where, params, BILL_DETAILS_FROM);

    let sql = `SELECT tb.id AS id, DATE(tb.createdon) AS date, tb.bill_no, tb.total AS bill_amount,
              GROUP_CONCAT(DISTINCT sp.payment_method) AS payment_type
       ${BILL_DETAILS_FROM}
       ${where} GROUP BY tb.id ORDER BY tb.createdon DESC`;
    const queryParams = [...params];
    if (pagination && isJsonReportFormat(filters.format)) {
      sql += " LIMIT ? OFFSET ?";
      queryParams.push(pagination.limit, pagination.offset);
    }
    const [rows] = await db.query(sql, { replacements: queryParams });
    return respondBillReport(res, rows, filters.format, "bill_details_report", {
      from: filters.from,
      to: filters.to,
    }, count, pagination);
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const cancelledBillsReport = async (req, res) => {
  try {
    await setSessionDefaults();
    const filters = normalizeReportQuery(req.query);
    const err = validateDates(filters.from, filters.to);
    if (err) return sendError(res, err);

    const pagination = parseReportPagination(filters);
    const params = [];
    const where = buildCancelledBillWhere(filters, params);
    const count = await countDistinctBills(where, params, CANCELLED_BILL_FROM);

    let sql = `SELECT tb.id AS id,
              DATE(tb.createdon) AS date,
              tb.bill_no,
              CASE WHEN tb.status = 'cancelled' THEN 'full' ELSE 'partial' END AS cancel_type,
              COALESCE(SUM(
                CASE
                  WHEN t.cancelled_qty > 0 THEN ROUND(t.line_total * t.cancelled_qty / NULLIF(t.quantity, 0), 2)
                  WHEN t.status = 0 THEN t.line_total
                  WHEN tb.status = 'cancelled' THEN t.line_total
                  ELSE 0
                END
              ), 0) AS bill_amount,
              GROUP_CONCAT(
                DISTINCT CASE
                  WHEN t.cancelled_qty > 0 THEN CONCAT(p.product_name, ' x', t.cancelled_qty)
                  WHEN t.status = 0 OR tb.status = 'cancelled' THEN
                    CONCAT(p.product_name, IF(t.quantity > 1 AND t.cancelled_qty = 0, CONCAT(' x', t.quantity), ''))
                  ELSE NULL
                END
                ORDER BY p.product_name SEPARATOR ', '
              ) AS items_billed,
              GROUP_CONCAT(DISTINCT sp.payment_method) AS payment_type,
              u.name AS staff,
              COALESCE(bc.name, 'Walk-in') AS customer,
              tb.cancellation_reason
       ${CANCELLED_BILL_FROM}
       ${where}
       GROUP BY tb.id, tb.status, tb.cancellation_reason, tb.createdon, tb.bill_no, u.name, bc.name
       ORDER BY tb.createdon DESC`;
    const queryParams = [...params];
    if (pagination && isJsonReportFormat(filters.format)) {
      sql += " LIMIT ? OFFSET ?";
      queryParams.push(pagination.limit, pagination.offset);
    }
    const [rows] = await db.query(sql, { replacements: queryParams });

    return respondBillReport(res, rows, filters.format, "cancelled_bills", {
      from: filters.from,
      to: filters.to,
    }, count, pagination);
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

function resolveDailyReportDateRange(filters) {
  if (!filters.from && !filters.to) {
    return { from: null, to: null, needsTodayDefault: true };
  }
  const from = filters.from || filters.to;
  const to = filters.to || filters.from;
  return { from, to, needsTodayDefault: false };
}

export const dailyReport = async (req, res) => {
  try {
    const filters = normalizeDailyReportQuery(req.query);
    let { from, to, needsTodayDefault } = resolveDailyReportDateRange(filters);
    if (needsTodayDefault) {
      const today = await getCurrentISTDate();
      from = today;
      to = today;
    }
    filters.from = from;
    filters.to = to;

    const err = validateDates(filters.from, filters.to);
    if (err) return sendError(res, err);

    const pagination = parseReportPagination(filters);
    const { data, count } = await getDailyReportRows(filters, pagination);

    if (isJsonReportFormat(filters.format)) {
      return res.status(200).json({
        status: true,
        count: Number.isFinite(Number(count)) ? Number(count) : 0,
        message: "Report data",
        from_date: filters.from,
        to_date: filters.to,
        data,
        ...(pagination ? { page: pagination.page, limit: pagination.limit } : {}),
      });
    }

    const exportRows = data.map(({ date, bill_total, product_name, ...rest }) => rest);
    return exportOrJson(res, exportRows, filters.format, "daily_report", {
      from: filters.from,
      to: filters.to,
      signatureDate: filters.from === filters.to ? filters.from : `${filters.from} to ${filters.to}`,
      extraMeta: buildDailyReportFilterMeta(filters),
    });
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

function buildDailyReportFilterMeta(filters) {
  const lines = [];
  if (filters.stock_no) lines.push(`Stock No: ${filters.stock_no}`);
  if (filters.product_id) lines.push(`Product ID: ${filters.product_id}`);
  if (filters.vendor_id) lines.push(`Vendor ID: ${filters.vendor_id}`);
  if (filters.staff_id) lines.push(`Staff ID: ${filters.staff_id}`);
  if (filters.bill_number) lines.push(`Bill No: ${filters.bill_number}`);
  if (filters.payment_type) lines.push(`Payment Type: ${filters.payment_type}`);
  return lines;
}

export const reportFilterVendors = async (req, res) => {
  const [rows] = await db.query(
    `SELECT id, vendor_name FROM vendors WHERE status = 1 ORDER BY vendor_name ASC`
  );
  return sendSuccess(res, "Vendors", rows);
};

export const reportFilterProducts = async (req, res) => {
  const [rows] = await db.query(`SELECT id, product_name FROM products WHERE status=1`);
  return sendSuccess(res, "Products", rows);
};

export const reportFilterStaff = async (req, res) => {
  const [rows] = await db.query(`SELECT id, name FROM users WHERE status=1`);
  return sendSuccess(res, "Staff", rows);
};

export const reportFilterPaymentTypes = async (req, res) => {
  return sendSuccess(res, "Payment types", PAYMENT_TYPE_LABELS);
};

async function exportOrJson(res, data, format, filename, pdfMeta = {}) {
  const rows = Array.isArray(data) ? data : [];
  if (isJsonReportFormat(format)) return sendReportSuccess(res, "Report data", rows, rows.length);
  if (format === "excel") {
    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Report");
    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", `attachment; filename=${filename}.xlsx`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(buf);
  }
  if (format === "pdf") {
    const html = buildAdminReportPdfHtml(filename, rows, pdfMeta);
    const pdf = await htmlToPdfBuffer(html);
    return sendPdf(res, pdf, filename);
  }
  return sendReportSuccess(res, "Report data", rows, rows.length, null);
}
