import { db, setSessionDefaults } from "../config/Database.js";
import { generateBillNumber, generateReturnBillNumber, previewNextBillNumber } from "../Utils/OrderNumberGen.js";
import {
  calculateLineTax,
  summarizeTax,
  validateBillDraft,
  resolveBillDiscount,
  resolveCreditApplied,
  applyBillDiscount,
  normalizeBillingPayload,
  buildPaymentMismatchDetail,
  getLineNetAmounts,
} from "../Utils/posTax.js";
import {
  mapProductRow,
  mapCustomerRow,
  mapBillPayments,
  mapTransactionLine,
  buildBillSummaryFromDb,
  paymentModeToDb,
  paymentModeFromDb,
} from "../Utils/posMappers.js";
import {
  computeLineStockStatus,
  getDefaultLowStockThreshold,
} from "../Utils/posStock.js";

async function loadProduct(productId) {
  const [[row]] = await db.query(
    `SELECT p.id, p.product_name, p.quantity, p.retail_price, p.discount, p.gst_id,
            g.tax AS gst_rate, g.type AS gst_type
     FROM products p LEFT JOIN gst g ON g.id = p.gst_id WHERE p.id = ? AND p.status = 1`,
    { replacements: [productId] }
  );
  return row ? mapProductRow(row) : null;
}

/** Prefer GST from product master; frontend often sends gstRate: 0 from cart lines. */
function resolveLineGst(line, product) {
  if (product.gstId != null) {
    return { gstRate: product.gstRate, gstType: product.gstType };
  }
  const lineRate = line.gstRate ?? line.gst_rate;
  if (lineRate !== undefined && lineRate !== null && lineRate !== "") {
    return {
      gstRate: Number(lineRate),
      gstType: String(line.gstType ?? line.gst_type ?? "exclusive").toLowerCase(),
    };
  }
  return { gstRate: product.gstRate, gstType: product.gstType };
}

async function enrichItems(items) {
  const enriched = [];
  for (const line of items || []) {
    const pid = line.productId ?? line.product_id;
    const product = await loadProduct(pid);
    if (!product) throw Object.assign(new Error(`Product ${pid} not found`), { code: "NOT_FOUND" });
    const gst = resolveLineGst(line, product);
    enriched.push({
      productId: product.productId,
      qty: Number(line.qty || 1),
      unitPrice: Number(line.unitPrice ?? product.unitPrice),
      gstRate: gst.gstRate,
      gstType: gst.gstType,
    });
  }
  return enriched;
}

export function buildBillQuote(payload, options = { isInterState: false }) {
  const normalized = normalizeBillingPayload(payload);
  const baseLines = (normalized.items || []).map((line) => calculateLineTax(line, options));
  const lineSummary = summarizeTax(baseLines);
  const { billDiscount } = resolveBillDiscount(normalized);
  const { lines, summary: summaryBase } = applyBillDiscount(lineSummary, baseLines, billDiscount, options);
  const { creditApplied } = resolveCreditApplied(normalized);
  const summary = {
    ...summaryBase,
    creditApplied,
    payableAmount: roundMoney(Math.max(0, summaryBase.grandTotal - creditApplied)),
  };
  const withSummary = { ...normalized, items: lines, summary };
  const validationErrors = validateBillDraft(withSummary);
  return { lines, summary, validationErrors, billDiscount: summary.billDiscount };
}

export async function quoteBilling(payload) {
  const normalized = normalizeBillingPayload(payload);
  const items = await enrichItems(normalized.items);
  const quote = buildBillQuote({ ...normalized, items });
  const stockCheck = await checkBillingStock(normalized.items || []);
  return {
    ...quote,
    stockOk: stockCheck.ok,
    stockLines: stockCheck.lines,
    stockWarnings: stockCheck.ok ? [] : stockCheck.details,
  };
}

/** Pre-checkout stock validation (SRD §6.1, §4.4). */
export async function checkBillingStock(items = []) {
  const lines = [];
  const details = [];

  for (let i = 0; i < items.length; i++) {
    const line = items[i];
    const pid = line.productId ?? line.product_id;
    const requestedQty = Number(line.qty || 0);

    const [[p]] = await db.query(
      `SELECT id, product_name, quantity FROM products WHERE id = ? AND status = 1`,
      { replacements: [pid] }
    );

    if (!p) {
      lines.push({
        productId: String(pid),
        productName: null,
        requestedQty,
        availableQty: 0,
        status: "not_found",
      });
      details.push({
        field: `items[${i}].productId`,
        productId: String(pid),
        message: "Product not found.",
      });
      continue;
    }

    const availableQty = Number(p.quantity);
    const threshold = getDefaultLowStockThreshold();
    const status = computeLineStockStatus(availableQty, requestedQty, threshold);

    lines.push({
      productId: String(p.id),
      productName: p.product_name,
      requestedQty,
      availableQty,
      lowStockThreshold: threshold,
      status,
    });

    if (status === "not_found" || status === "out_of_stock" || status === "insufficient_stock") {
      details.push({
        field: `items[${i}].qty`,
        productId: String(p.id),
        message:
          status === "out_of_stock"
            ? "Product is out of stock."
            : "Requested quantity exceeds available stock.",
        availableQty,
        requestedQty,
        status,
      });
    }
  }

  return { ok: details.length === 0, lines, details };
}

/** Products with zero on-hand qty (SRD §4.3 visibility). */
export async function listOutOfStock({ search = "", page = 1, limit = 20 } = {}) {
  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (parsedPage - 1) * parsedLimit;

  let extraWhere = ` AND p.quantity < 1`;
  const params = [];
  const q = String(search).trim();
  if (q) {
    extraWhere += ` AND (p.stock_no LIKE ? OR p.product_name LIKE ?)`;
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM products p WHERE p.status = 1 AND p.published = 1${extraWhere}`,
    { replacements: params }
  );

  const [rows] = await db.query(
    `${posProductSelectSql()}${extraWhere} ORDER BY p.product_name ASC LIMIT ? OFFSET ?`,
    { replacements: [...params, parsedLimit, offset] }
  );

  return {
    rows: rows.map(mapProductRow),
    page: parsedPage,
    limit: parsedLimit,
    total: Number(total),
  };
}

export async function getNextBillNo() {
  const nextBillNo = await previewNextBillNumber();
  return { nextBillNo };
}

async function resolveCustomer(customer) {
  const name = String(customer?.name || "").trim();
  const mobile = String(customer?.mobile || "").trim();
  if (!name || !mobile) return null;

  const [[existing]] = await db.query(
    `SELECT id FROM billing_customers WHERE mobile = ? OR LOWER(name) = LOWER(?) LIMIT 1`,
    { replacements: [mobile, name] }
  );

  if (existing?.id) {
    await db.query(
      `UPDATE billing_customers SET name = ?, mobile = ?, email = ?, gst_number = ? WHERE id = ?`,
      {
        replacements: [
          name,
          mobile,
          customer.email || null,
          customer.gstNumber || customer.gst_number || null,
          existing.id,
        ],
      }
    );
    return existing.id;
  }

  const [id] = await db.query(
    `INSERT INTO billing_customers (name, email, mobile, gst_number) VALUES (?,?,?,?)`,
    {
      replacements: [
        name,
        customer.email || null,
        mobile,
        customer.gstNumber || customer.gst_number || null,
      ],
    }
  );
  return id;
}

export async function checkoutBilling(payload, staffId) {
  const normalized = normalizeBillingPayload(payload);
  const quote = await quoteBilling(normalized);
  if (quote.validationErrors.length > 0) {
    return { ok: false, status: 422, code: "VALIDATION_FAILED", message: "Billing validation failed.", details: quote.validationErrors };
  }

  const name = String(normalized.customer?.name || "").trim();
  const mobile = String(normalized.customer?.mobile || "").trim();
  if (!name || !mobile) {
    return { ok: false, status: 422, code: "VALIDATION_FAILED", message: "Customer name and mobile are required.", details: [] };
  }

  const t = await db.transaction();
  try {
    await setSessionDefaults();

    for (const line of quote.lines) {
      const [[p]] = await db.query(`SELECT quantity, product_name FROM products WHERE id = ? FOR UPDATE`, {
        replacements: [line.productId],
        transaction: t,
      });
      if (!p || p.quantity < line.qty) {
        throw new Error(`Insufficient stock for product ${line.productId}`);
      }
    }

    const customerId = await resolveCustomer(normalized.customer);
    const billNo = await generateBillNumber();
    const creditApplied = Number(quote.summary.creditApplied || 0);
    const billDiscount = Number(quote.summary.billDiscount || 0);
    const discountTotal = Number(quote.summary.discountTotal || billDiscount);
    const finalPayable = roundMoney(quote.summary.grandTotal - creditApplied);

    const paymentTotal = (normalized.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
    if (normalized.payments?.length && Math.abs(paymentTotal - finalPayable) > 0.01) {
      await t.rollback();
      return {
        ok: false,
        status: 422,
        code: "VALIDATION_FAILED",
        message: "Billing validation failed.",
        details: [
          buildPaymentMismatchDetail({
            itemsTotal: quote.summary.itemsTotal,
            billDiscount,
            grandTotal: quote.summary.grandTotal,
            creditApplied,
            paymentTotal,
          }),
        ],
      };
    }

    if (creditApplied > 0 && customerId) {
      await db.query(`INSERT IGNORE INTO customer_credit_wallet (customer_id, balance) VALUES (?, 0)`, {
        replacements: [customerId],
        transaction: t,
      });
      const [[wallet]] = await db.query(
        `SELECT balance FROM customer_credit_wallet WHERE customer_id = ? FOR UPDATE`,
        { replacements: [customerId], transaction: t }
      );
      if (!wallet || Number(wallet.balance) < creditApplied) {
        throw new Error("Insufficient credit balance");
      }
    }

    const [billId] = await db.query(
      `INSERT INTO transaction_billing
       (bill_no, bill_type, customer_id, staff_id, manual_order_number, subtotal, discount, gst_total, cgst, sgst, total, credit_applied, payment_status, status)
       VALUES (?, 'sale', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', 'completed')`,
      {
        replacements: [
          billNo,
          customerId,
          staffId,
          normalized.orderNumber || null,
          quote.summary.totalTaxableAmount,
          discountTotal,
          quote.summary.totalGst,
          quote.summary.totalCgst,
          quote.summary.totalSgst,
          finalPayable,
          creditApplied,
        ],
        transaction: t,
      }
    );

    for (const line of quote.lines) {
      const net = getLineNetAmounts(line);
      const [[p]] = await db.query(
        `SELECT p.*, g.id AS gst_id FROM products p LEFT JOIN gst g ON g.id = p.gst_id WHERE p.id = ? FOR UPDATE`,
        { replacements: [line.productId], transaction: t }
      );
      await db.query(
        `INSERT INTO transactions (bill_id, product_id, stock_no, quantity, unit_price, discount, gst_id, gst_amount, cgst, sgst, line_total, status, createdby)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?)`,
        {
          replacements: [
            billId,
            p.id,
            p.stock_no,
            line.qty,
            line.unitPrice,
            line.billDiscountShare || 0,
            p.gst_id,
            net.gstAmount,
            net.cgst,
            net.sgst,
            net.lineTotal,
            staffId,
          ],
          transaction: t,
        }
      );
      const beforeQty = p.quantity;
      const afterQty = beforeQty - line.qty;
      await db.query(`UPDATE products SET quantity = ? WHERE id = ?`, {
        replacements: [afterQty, p.id],
        transaction: t,
      });
      await db.query(
        `INSERT INTO inventory_logs (product_id, staff_id, action_type, quantity_changed, before_qty, after_qty, reference_type, reference_id)
         VALUES (?,?,?,?,?,?,?,?)`,
        {
          replacements: [p.id, staffId, "sale", line.qty, beforeQty, afterQty, "bill", billNo],
          transaction: t,
        }
      );
    }

    const paymentsOut = [];
    for (const pay of normalized.payments || []) {
      await db.query(`INSERT INTO split_payments (bill_id, payment_method, amount) VALUES (?,?,?)`, {
        replacements: [billId, paymentModeToDb(pay.mode), pay.amount],
        transaction: t,
      });
      paymentsOut.push({
        paymentId: `PAY-${billId}-${paymentsOut.length}`,
        billNo,
        mode: pay.mode,
        amount: Number(pay.amount),
        transactionRef: pay.transactionRef || null,
      });
    }

    if (creditApplied > 0 && customerId) {
      await db.query(`UPDATE customer_credit_wallet SET balance = balance - ? WHERE customer_id = ?`, {
        replacements: [creditApplied, customerId],
        transaction: t,
      });
      await db.query(
        `INSERT INTO customer_credit_logs (customer_id, amount, type, bill_ref, notes) VALUES (?,?,?,?,?)`,
        { replacements: [customerId, creditApplied, "debit", billNo, "Applied on purchase"], transaction: t }
      );
    }

    await t.commit();

    const bill = {
      billNo,
      billType: normalized.billType || "POS",
      billDateTime: new Date().toISOString(),
      staffId: String(staffId),
      customerId: customerId ? String(customerId) : null,
      customerGst: normalized.customer?.gstNumber
        ? { gstin: normalized.customer.gstNumber, name: normalized.customer.name }
        : null,
      orderNumber: normalized.orderNumber || null,
      parentBillNo: null,
      items: quote.lines,
      summary: quote.summary,
      billDiscount,
      discountTotal,
      taxTotal: quote.summary.totalGst,
      grandTotal: quote.summary.grandTotal,
      creditApplied,
      payableAmount: finalPayable,
    };

    return { ok: true, status: 201, data: { bill, invoice: bill, payments: paymentsOut } };
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

const TX_STATUS = Object.freeze({ CANCELLED: 0, ACTIVE: 1, RETURNED: 2 });

function getRemainingQty(orig) {
  return Math.max(
    0,
    Number(orig.quantity) - Number(orig.returned_qty || 0) - Number(orig.cancelled_qty || 0)
  );
}

function roundMoney(value) {
  return Number(Number(value).toFixed(2));
}

async function loadBillTransactionRows(parentBillId, transactionIds, transaction = null) {
  if (!transactionIds.length) return [];
  const [rows] = await db.query(
    `SELECT t.*, p.product_name, g.tax AS gst_rate, g.type AS gst_type
     FROM transactions t
     JOIN products p ON p.id = t.product_id
     LEFT JOIN gst g ON g.id = t.gst_id
     WHERE t.bill_id = ? AND t.id IN (?)`,
    { replacements: [parentBillId, transactionIds], transaction }
  );
  return rows;
}

function normalizeLineItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    transactionId: Number(item.transactionId ?? item.transaction_id),
    productId: item.productId != null ? String(item.productId) : item.product_id != null ? String(item.product_id) : "",
    qty: Number(item.qty),
  }));
}

const normalizeReturnItems = normalizeLineItems;
const normalizeCancelItems = normalizeLineItems;

function validateReturnItems(returnItems, transactionRows) {
  const errors = [];
  const rowById = Object.fromEntries(transactionRows.map((r) => [r.id, r]));
  const seenTx = new Set();

  returnItems.forEach((item, idx) => {
    if (!Number.isInteger(item.transactionId) || item.transactionId <= 0) {
      errors.push({ field: `items[${idx}].transactionId`, message: "transactionId is required." });
      return;
    }
    if (seenTx.has(item.transactionId)) {
      errors.push({ field: `items[${idx}].transactionId`, message: "Duplicate transactionId in request." });
      return;
    }
    seenTx.add(item.transactionId);

    const orig = rowById[item.transactionId];
    if (!orig) {
      errors.push({
        field: `items[${idx}].transactionId`,
        message: `Transaction ${item.transactionId} not found on parent bill.`,
      });
      return;
    }
    if (Number(orig.status) === TX_STATUS.CANCELLED) {
      errors.push({
        field: `items[${idx}].transactionId`,
        message: `Transaction ${item.transactionId} is cancelled.`,
      });
      return;
    }
    if (Number(orig.status) === TX_STATUS.RETURNED) {
      errors.push({
        field: `items[${idx}].transactionId`,
        message: `Transaction ${item.transactionId} is already fully returned.`,
      });
      return;
    }
    if (item.productId && String(orig.product_id) !== item.productId) {
      errors.push({ field: `items[${idx}].productId`, message: "productId does not match transaction." });
      return;
    }
    if (item.qty <= 0) {
      errors.push({ field: `items[${idx}].qty`, message: "Return quantity must be greater than zero." });
      return;
    }
    const remaining = getRemainingQty(orig);
    if (item.qty > remaining) {
      errors.push({
        field: `items[${idx}].qty`,
        message: `Return quantity cannot exceed remaining quantity (${remaining}).`,
      });
    }
  });

  return errors;
}

function validateCancelItems(cancelItems, transactionRows) {
  const errors = [];
  const rowById = Object.fromEntries(transactionRows.map((r) => [r.id, r]));
  const seenTx = new Set();

  cancelItems.forEach((item, idx) => {
    if (!Number.isInteger(item.transactionId) || item.transactionId <= 0) {
      errors.push({ field: `items[${idx}].transactionId`, message: "transactionId is required." });
      return;
    }
    if (seenTx.has(item.transactionId)) {
      errors.push({ field: `items[${idx}].transactionId`, message: "Duplicate transactionId in request." });
      return;
    }
    seenTx.add(item.transactionId);

    const orig = rowById[item.transactionId];
    if (!orig) {
      errors.push({
        field: `items[${idx}].transactionId`,
        message: `Transaction ${item.transactionId} not found on parent bill.`,
      });
      return;
    }
    if (Number(orig.status) === TX_STATUS.CANCELLED) {
      errors.push({
        field: `items[${idx}].transactionId`,
        message: `Transaction ${item.transactionId} is already cancelled.`,
      });
      return;
    }
    if (Number(orig.status) === TX_STATUS.RETURNED) {
      errors.push({
        field: `items[${idx}].transactionId`,
        message: `Transaction ${item.transactionId} is already fully returned.`,
      });
      return;
    }
    if (item.productId && String(orig.product_id) !== item.productId) {
      errors.push({ field: `items[${idx}].productId`, message: "productId does not match transaction." });
      return;
    }
    if (item.qty <= 0) {
      errors.push({ field: `items[${idx}].qty`, message: "Cancel quantity must be greater than zero." });
      return;
    }
    const remaining = getRemainingQty(orig);
    if (item.qty > remaining) {
      errors.push({
        field: `items[${idx}].qty`,
        message: `Cancel quantity cannot exceed remaining quantity (${remaining}).`,
      });
    }
  });

  return errors;
}

function buildPartialLineFromTransaction(orig, qty) {
  const origQty = Number(orig.quantity);
  const ratio = origQty > 0 ? qty / origQty : 0;
  return {
    ...calculateLineTax({
      transactionId: String(orig.id),
      productId: String(orig.product_id),
      qty,
      unitPrice: Number(orig.unit_price),
      gstRate: Number(orig.gst_rate || 0),
      gstType: orig.gst_type || "exclusive",
      billDiscountShare: Number(orig.discount || 0) * ratio,
    }),
    productName: orig.product_name,
    parentTransactionId: String(orig.id),
  };
}

const buildReturnLineFromTransaction = buildPartialLineFromTransaction;
const buildCancelLineFromTransaction = buildPartialLineFromTransaction;

export async function getBillByBillNo(billNo) {
  const [[bill]] = await db.query(
    `SELECT tb.*, bc.name AS customer_name, bc.mobile
     FROM transaction_billing tb
     LEFT JOIN billing_customers bc ON bc.id = tb.customer_id
     WHERE tb.bill_no = ? AND tb.bill_type = 'sale'`,
    { replacements: [billNo] }
  );
  if (!bill) return null;

  const [items] = await db.query(
    `SELECT t.*, p.product_name, g.tax AS gst_rate, g.type AS gst_type
     FROM transactions t
     JOIN products p ON p.id = t.product_id
     LEFT JOIN gst g ON g.id = t.gst_id
     WHERE t.bill_id = ? AND t.status = 1`,
    { replacements: [bill.id] }
  );

  const [payments] = await db.query(
    `SELECT sp.*, tb.bill_no FROM split_payments sp JOIN transaction_billing tb ON tb.id = sp.bill_id WHERE sp.bill_id = ?`,
    { replacements: [bill.id] }
  );

  const mappedItems = items.map((t) => {
    const returnedQty = Number(t.returned_qty || 0);
    const cancelledQty = Number(t.cancelled_qty || 0);
    const qty = Number(t.quantity);
    const remainingQty = getRemainingQty(t);
    return {
      ...mapTransactionLine(t, t.gst_rate, t.gst_type),
      alreadyReturnedQty: returnedQty,
      alreadyCancelledQty: cancelledQty,
      returnableQty: remainingQty,
      cancellableQty: remainingQty,
      lineStatus:
        Number(t.status) === TX_STATUS.RETURNED
          ? "returned"
          : Number(t.status) === TX_STATUS.CANCELLED
            ? "cancelled"
            : "active",
    };
  });

  const itemsTotal = roundMoney(mappedItems.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0));
  const storedDiscountTotal = Number(bill.discount || 0);
  const billDiscount = roundMoney(storedDiscountTotal);
  const creditApplied = Number(bill.credit_applied || 0);
  const payableAmount = Number(bill.total || 0);
  const grandTotalBeforeCredit = roundMoney(payableAmount + creditApplied);

  const billDto = {
    billNo: bill.bill_no,
    billType: "POS",
    billDateTime: bill.createdon,
    staffId: String(bill.staff_id || ""),
    customerId: bill.customer_id ? String(bill.customer_id) : null,
    orderNumber: bill.manual_order_number,
    parentBillNo: null,
    items: mappedItems,
    summary: {
      ...buildBillSummaryFromDb(bill),
      itemsTotal,
      billDiscount,
      discountTotal: roundMoney(storedDiscountTotal),
      grandTotal: grandTotalBeforeCredit,
    },
    billDiscount,
    discountTotal: roundMoney(storedDiscountTotal),
    taxTotal: Number(bill.gst_total || 0),
    grandTotal: grandTotalBeforeCredit,
    creditApplied,
    payableAmount,
  };

  return {
    bill: billDto,
    payments: mapBillPayments(payments.map((p) => ({ ...p, bill_no: bill.bill_no }))),
  };
}

export async function quoteReturn(payload) {
  const parentBillNo = String(payload.parentBillNo || "").trim();
  if (!parentBillNo) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION_FAILED",
      message: "Return validation failed.",
      details: [{ field: "parentBillNo", message: "parentBillNo is required." }],
    };
  }

  const parent = await loadSaleBillByBillNo(parentBillNo);
  if (!parent) return { ok: false, status: 404, code: "NOT_FOUND", message: "Parent bill not found." };
  if (parent.status === "cancelled") {
    return {
      ok: false,
      status: 409,
      code: "BILL_CANCELLED",
      message: "Cannot return against a cancelled bill.",
    };
  }

  const returnItems = normalizeReturnItems(payload.items);
  if (returnItems.length === 0) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION_FAILED",
      message: "Return validation failed.",
      details: [{ field: "items", message: "At least one return item is required." }],
    };
  }

  const transactionIds = returnItems.map((i) => i.transactionId);
  const rows = await loadBillTransactionRows(parent.id, transactionIds);
  const validationErrors = validateReturnItems(returnItems, rows);

  if (validationErrors.length > 0) {
    return {
      ok: false,
      status: 409,
      code: "RETURN_VALIDATION_FAILED",
      message: "Return validation failed.",
      details: validationErrors,
    };
  }

  const rowById = Object.fromEntries(rows.map((r) => [r.id, r]));
  const lines = returnItems.map((item) => buildReturnLineFromTransaction(rowById[item.transactionId], item.qty));
  const summary = summarizeTax(lines);

  return { ok: true, data: { lines, summary, validationErrors: [] } };
}

export async function checkoutReturn(payload, staffId) {
  const quoteResult = await quoteReturn(payload);
  if (!quoteResult.ok) return quoteResult;

  const parentBillNo = String(payload.parentBillNo).trim();
  const effectiveStaffId = payload.staffId || staffId;
  const quote = quoteResult.data;

  const t = await db.transaction();
  try {
    await setSessionDefaults();

    const parent = await loadSaleBillByBillNo(parentBillNo, t);
    if (!parent) {
      await t.rollback();
      return { ok: false, status: 404, code: "NOT_FOUND", message: "Parent bill not found." };
    }
    if (parent.status === "cancelled") {
      await t.rollback();
      return {
        ok: false,
        status: 409,
        code: "BILL_CANCELLED",
        message: "Cannot return against a cancelled bill.",
      };
    }

    const billNo = await generateReturnBillNumber();

    const [returnBillId] = await db.query(
      `INSERT INTO transaction_billing (bill_no, bill_type, parent_bill_id, customer_id, staff_id, subtotal, gst_total, cgst, sgst, total, status)
       VALUES (?, 'return', ?, ?, ?, ?, ?, ?, ?, ?, 'completed')`,
      {
        replacements: [
          billNo,
          parent.id,
          parent.customer_id,
          effectiveStaffId,
          quote.summary.totalTaxableAmount,
          quote.summary.totalGst,
          quote.summary.totalCgst,
          quote.summary.totalSgst,
          quote.summary.grandTotal,
        ],
        transaction: t,
      }
    );

    for (const line of quote.lines) {
      const transactionId = Number(line.transactionId);
      const [[orig]] = await db.query(
        `SELECT t.*, p.product_name FROM transactions t JOIN products p ON p.id = t.product_id
         WHERE t.id = ? AND t.bill_id = ? FOR UPDATE`,
        { replacements: [transactionId, parent.id], transaction: t }
      );
      if (!orig) throw new Error(`Transaction ${transactionId} not found on parent bill.`);
      if (Number(orig.status) === TX_STATUS.CANCELLED) {
        throw new Error(`Transaction ${transactionId} is cancelled.`);
      }
      if (Number(orig.status) === TX_STATUS.RETURNED) {
        throw new Error(`Transaction ${transactionId} is already fully returned.`);
      }

      const remaining = Number(orig.quantity) - Number(orig.returned_qty || 0);
      if (line.qty > remaining) {
        throw new Error(`Return qty exceeds remaining for transaction ${transactionId}.`);
      }

      await db.query(
        `INSERT INTO transactions (bill_id, parent_transaction_id, product_id, stock_no, quantity, unit_price, discount, gst_amount, cgst, sgst, line_total, status, createdby)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?)`,
        {
          replacements: [
            returnBillId,
            orig.id,
            orig.product_id,
            orig.stock_no,
            line.qty,
            line.unitPrice,
            line.billDiscountShare || 0,
            line.gstAmount,
            line.cgst,
            line.sgst,
            line.lineTotal,
            effectiveStaffId,
          ],
          transaction: t,
        }
      );

      const newReturnedQty = Number(orig.returned_qty || 0) + line.qty;
      const newStatus = newReturnedQty >= Number(orig.quantity) ? TX_STATUS.RETURNED : TX_STATUS.ACTIVE;
      await db.query(`UPDATE transactions SET returned_qty = ?, status = ? WHERE id = ?`, {
        replacements: [newReturnedQty, newStatus, orig.id],
        transaction: t,
      });

      const [[p]] = await db.query(`SELECT quantity FROM products WHERE id = ? FOR UPDATE`, {
        replacements: [orig.product_id],
        transaction: t,
      });
      const afterQty = p.quantity + line.qty;
      await db.query(`UPDATE products SET quantity = ? WHERE id = ?`, {
        replacements: [afterQty, orig.product_id],
        transaction: t,
      });
      await db.query(
        `INSERT INTO inventory_logs (product_id, staff_id, action_type, quantity_changed, before_qty, after_qty, reference_type, reference_id)
         VALUES (?,?,?,?,?,?,?,?)`,
        {
          replacements: [orig.product_id, effectiveStaffId, "return", line.qty, p.quantity, afterQty, "return_bill", billNo],
          transaction: t,
        }
      );
    }

    if (payload.settlementMode === "CREDIT" && parent.customer_id) {
      await db.query(`INSERT IGNORE INTO customer_credit_wallet (customer_id, balance) VALUES (?, 0)`, {
        replacements: [parent.customer_id],
        transaction: t,
      });
      for (const line of quote.lines) {
        const earned = Number(line.lineTotal || 0);
        await db.query(`UPDATE customer_credit_wallet SET balance = balance + ? WHERE customer_id = ?`, {
          replacements: [earned, parent.customer_id],
          transaction: t,
        });
        await db.query(
          `INSERT INTO customer_credit_logs (customer_id, amount, type, bill_ref, notes) VALUES (?,?,?,?,?)`,
          {
            replacements: [
              parent.customer_id,
              earned,
              "credit",
              billNo,
              `Return transaction ${line.transactionId}`,
            ],
            transaction: t,
          }
        );
      }
    }

    await t.commit();

    const returnBill = {
      billNo,
      billType: "RETURN",
      billDateTime: new Date().toISOString(),
      parentBillNo,
      staffId: String(effectiveStaffId || ""),
      customerId: parent.customer_id ? String(parent.customer_id) : null,
      settlementMode: payload.settlementMode || null,
      items: quote.lines,
      summary: quote.summary,
      grandTotal: quote.summary.grandTotal,
    };

    return { ok: true, status: 201, data: { returnBill, parentBillRef: parentBillNo } };
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

async function loadSaleBillByBillNo(billNo, transaction = null) {
  const lock = transaction ? " FOR UPDATE" : "";
  const [[bill]] = await db.query(
    `SELECT * FROM transaction_billing WHERE bill_no = ? AND bill_type = 'sale'${lock}`,
    { replacements: [billNo], transaction }
  );
  return bill || null;
}

function parseCancellationReason(payload) {
  const raw = payload.cancellationReason ?? payload.cancellation_reason;
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  return trimmed || null;
}

function summarizeCancelLines(lines) {
  return {
    totalTaxableAmount: lines.reduce((s, l) => s + l.taxableAmount, 0),
    totalCgst: lines.reduce((s, l) => s + l.cgst, 0),
    totalSgst: lines.reduce((s, l) => s + l.sgst, 0),
    totalIgst: 0,
    totalGst: lines.reduce((s, l) => s + l.gstAmount, 0),
    grandTotal: lines.reduce((s, l) => s + l.lineTotal, 0),
    byRate: [],
  };
}

async function recalculateParentBillTotals(parentBillId, transaction, cancellationReason = null) {
  const [lines] = await db.query(`SELECT * FROM transactions WHERE bill_id = ?`, {
    replacements: [parentBillId],
    transaction,
  });

  let subtotal = 0;
  let gstTotal = 0;
  let cgst = 0;
  let sgst = 0;
  let total = 0;
  let activeLineCount = 0;

  for (const line of lines) {
    const remainingQty = getRemainingQty(line);
    if (remainingQty <= 0) {
      if (Number(line.status) !== TX_STATUS.CANCELLED) {
        const newStatus =
          Number(line.returned_qty || 0) >= Number(line.quantity) ? TX_STATUS.RETURNED : TX_STATUS.CANCELLED;
        await db.query(`UPDATE transactions SET status = ? WHERE id = ?`, {
          replacements: [newStatus, line.id],
          transaction,
        });
      }
      continue;
    }

    activeLineCount++;
    const ratio = remainingQty / Number(line.quantity);
    subtotal = roundMoney(subtotal + (Number(line.unit_price) * Number(line.quantity) - Number(line.discount || 0)) * ratio);
    gstTotal = roundMoney(gstTotal + Number(line.gst_amount || 0) * ratio);
    cgst = roundMoney(cgst + Number(line.cgst || 0) * ratio);
    sgst = roundMoney(sgst + Number(line.sgst || 0) * ratio);
    total = roundMoney(total + Number(line.line_total || 0) * ratio);
  }

  if (activeLineCount === 0) {
    await db.query(
      `UPDATE transaction_billing
       SET subtotal = 0, gst_total = 0, cgst = 0, sgst = 0, total = 0, status = 'cancelled', cancellation_reason = ?
       WHERE id = ?`,
      { replacements: [cancellationReason, parentBillId], transaction }
    );
    return { fullyCancelled: true };
  }

  await db.query(
    `UPDATE transaction_billing
     SET subtotal = ?, gst_total = ?, cgst = ?, sgst = ?, total = ?, cancellation_reason = ?, status = 'completed'
     WHERE id = ?`,
    { replacements: [subtotal, gstTotal, cgst, sgst, total, cancellationReason, parentBillId], transaction }
  );

  return { fullyCancelled: false, subtotal, gstTotal, cgst, sgst, total };
}

export async function quoteCancelBill(payload) {
  const parentBillNo = String(payload.parentBillNo || "").trim();
  const cancelItems = normalizeCancelItems(payload.items);

  if (!parentBillNo) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION_FAILED",
      message: "Cancel validation failed.",
      details: [{ field: "parentBillNo", message: "parentBillNo is required." }],
    };
  }
  if (cancelItems.length === 0) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION_FAILED",
      message: "Cancel validation failed.",
      details: [{ field: "items", message: "At least one cancel item is required." }],
    };
  }

  const parent = await loadSaleBillByBillNo(parentBillNo);
  if (!parent) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Parent bill not found." };
  }
  if (parent.status === "cancelled") {
    return {
      ok: false,
      status: 409,
      code: "ALREADY_CANCELLED",
      message: "Parent bill is already cancelled.",
    };
  }

  const transactionIds = cancelItems.map((i) => i.transactionId);
  const rows = await loadBillTransactionRows(parent.id, transactionIds);
  const validationErrors = validateCancelItems(cancelItems, rows);
  if (validationErrors.length > 0) {
    return {
      ok: false,
      status: 409,
      code: "CANCEL_VALIDATION_FAILED",
      message: "Cancel validation failed.",
      details: validationErrors,
    };
  }

  const rowById = Object.fromEntries(rows.map((r) => [r.id, r]));
  const lines = cancelItems.map((item) => buildCancelLineFromTransaction(rowById[item.transactionId], item.qty));
  const summary = summarizeCancelLines(lines);
  const cancellationReason = parseCancellationReason(payload);

  return {
    ok: true,
    data: {
      parentBillNo,
      settlementMode: payload.settlementMode || null,
      cancellationReason,
      lines,
      summary,
      validationErrors: [],
    },
  };
}

export async function checkoutCancelBill(payload, staffId) {
  const cancellationReason = parseCancellationReason(payload);
  if (!cancellationReason) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION_FAILED",
      message: "Cancel validation failed.",
      details: [{ field: "cancellationReason", message: "cancellationReason is required." }],
    };
  }

  const quoteResult = await quoteCancelBill(payload);
  if (!quoteResult.ok) return quoteResult;

  const parentBillNo = String(payload.parentBillNo).trim();
  const cancelItems = normalizeCancelItems(payload.items);
  const transactionIds = cancelItems.map((i) => i.transactionId);
  const effectiveStaffId = payload.staffId || staffId;
  const quote = quoteResult.data;

  const t = await db.transaction();
  try {
    await setSessionDefaults();

    const parent = await loadSaleBillByBillNo(parentBillNo, t);
    if (!parent) {
      await t.rollback();
      return { ok: false, status: 404, code: "NOT_FOUND", message: "Parent bill not found." };
    }
    if (parent.status === "cancelled") {
      await t.rollback();
      return {
        ok: false,
        status: 409,
        code: "ALREADY_CANCELLED",
        message: "Parent bill is already cancelled.",
      };
    }

    const rows = await loadBillTransactionRows(parent.id, transactionIds, t);
    const validationErrors = validateCancelItems(cancelItems, rows);
    if (validationErrors.length > 0) {
      await t.rollback();
      return {
        ok: false,
        status: 409,
        code: "CANCEL_VALIDATION_FAILED",
        message: "Cancel validation failed.",
        details: validationErrors,
      };
    }

    for (const line of quote.lines) {
      const transactionId = Number(line.transactionId);
      const [[orig]] = await db.query(
        `SELECT t.*, p.product_name FROM transactions t JOIN products p ON p.id = t.product_id
         WHERE t.id = ? AND t.bill_id = ? FOR UPDATE`,
        { replacements: [transactionId, parent.id], transaction: t }
      );
      if (!orig) throw new Error(`Transaction ${transactionId} not found on parent bill.`);
      if (Number(orig.status) === TX_STATUS.CANCELLED) {
        throw new Error(`Transaction ${transactionId} is already cancelled.`);
      }
      if (Number(orig.status) === TX_STATUS.RETURNED) {
        throw new Error(`Transaction ${transactionId} is already fully returned.`);
      }

      const remaining = getRemainingQty(orig);
      if (line.qty > remaining) {
        throw new Error(`Cancel qty exceeds remaining for transaction ${transactionId}.`);
      }

      const [[p]] = await db.query(`SELECT quantity FROM products WHERE id = ? FOR UPDATE`, {
        replacements: [orig.product_id],
        transaction: t,
      });
      const beforeQty = p.quantity;
      const afterQty = beforeQty + line.qty;

      await db.query(`UPDATE products SET quantity = ? WHERE id = ?`, {
        replacements: [afterQty, orig.product_id],
        transaction: t,
      });
      await db.query(
        `INSERT INTO inventory_logs (product_id, staff_id, action_type, quantity_changed, before_qty, after_qty, reference_type, reference_id, notes)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        {
          replacements: [
            orig.product_id,
            effectiveStaffId,
            "cancel",
            line.qty,
            beforeQty,
            afterQty,
            "cancel_bill",
            parent.bill_no,
            cancellationReason,
          ],
          transaction: t,
        }
      );

      const newCancelledQty = Number(orig.cancelled_qty || 0) + line.qty;
      const fullyConsumed =
        newCancelledQty + Number(orig.returned_qty || 0) >= Number(orig.quantity);
      const newStatus = fullyConsumed
        ? Number(orig.returned_qty || 0) >= Number(orig.quantity)
          ? TX_STATUS.RETURNED
          : TX_STATUS.CANCELLED
        : TX_STATUS.ACTIVE;

      await db.query(`UPDATE transactions SET cancelled_qty = ?, status = ? WHERE id = ?`, {
        replacements: [newCancelledQty, newStatus, orig.id],
        transaction: t,
      });
    }

    if (payload.settlementMode === "CREDIT" && parent.customer_id) {
      await db.query(`INSERT IGNORE INTO customer_credit_wallet (customer_id, balance) VALUES (?, 0)`, {
        replacements: [parent.customer_id],
        transaction: t,
      });
      for (const line of quote.lines) {
        const earned = Number(line.lineTotal || 0);
        await db.query(`UPDATE customer_credit_wallet SET balance = balance + ? WHERE customer_id = ?`, {
          replacements: [earned, parent.customer_id],
          transaction: t,
        });
        await db.query(
          `INSERT INTO customer_credit_logs (customer_id, amount, type, bill_ref, notes) VALUES (?,?,?,?,?)`,
          {
            replacements: [
              parent.customer_id,
              earned,
              "credit",
              parent.bill_no,
              `${cancellationReason} (transaction ${line.transactionId})`,
            ],
            transaction: t,
          }
        );
      }
    }

    const billTotals = await recalculateParentBillTotals(parent.id, t, cancellationReason);

    await t.commit();

    const cancelBill = {
      billType: "CANCEL",
      billDateTime: new Date().toISOString(),
      parentBillNo,
      staffId: String(effectiveStaffId || ""),
      customerId: parent.customer_id ? String(parent.customer_id) : null,
      settlementMode: payload.settlementMode || null,
      cancellationReason,
      items: quote.lines,
      summary: quote.summary,
      parentBillStatus: billTotals.fullyCancelled ? "cancelled" : "completed",
      grandTotal: quote.summary.grandTotal,
    };

    return { ok: true, status: 200, data: { cancelBill, parentBillRef: parentBillNo } };
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

export async function searchCustomers(query = "") {
  const value = String(query).trim();
  if (!value) return [];
  const like = `%${value}%`;
  const [rows] = await db.query(
    `SELECT id, name, mobile, email, gst_number FROM billing_customers
     WHERE name LIKE ? OR mobile LIKE ? ORDER BY name LIMIT 8`,
    { replacements: [like, like] }
  );
  return rows.map(mapCustomerRow);
}

export async function getCreditWallet(customerId) {
  const [[customer]] = await db.query(`SELECT id FROM billing_customers WHERE id = ?`, {
    replacements: [customerId],
  });
  if (!customer) return null;

  const [[wallet]] = await db.query(`SELECT balance FROM customer_credit_wallet WHERE customer_id = ?`, {
    replacements: [customerId],
  });
  const [ledger] = await db.query(
    `SELECT id, customer_id, amount, type, bill_ref, notes, createdon FROM customer_credit_logs
     WHERE customer_id = ? ORDER BY createdon DESC LIMIT 50`,
    { replacements: [customerId] }
  );

  return {
    customerId: String(customerId),
    balance: Number(wallet?.balance || 0),
    ledger: ledger.map((e) => ({
      creditTxnId: `CR-${e.id}`,
      customerId: String(e.customer_id),
      billNo: e.bill_ref,
      type: e.type === "credit" ? "EARNED" : "USED",
      amount: Number(e.amount),
      balanceAfter: null,
      timestamp: e.createdon,
    })),
  };
}

export async function applyWalletCredit(customerId, amount) {
  const wallet = await getCreditWallet(customerId);
  if (!wallet) return { ok: false, status: 404, code: "NOT_FOUND", message: "Customer not found." };
  if (Number(amount) > wallet.balance) {
    return {
      ok: false,
      status: 409,
      code: "INSUFFICIENT_CREDIT",
      message: "Credit usage cannot exceed available balance.",
    };
  }
  return {
    ok: true,
    data: {
      customerId: String(customerId),
      requested: Number(amount),
      allowed: Number(amount),
      balanceAfterApply: wallet.balance - Number(amount),
    },
  };
}

/** Parse QR JSON or plain stock number hints from scanner input. */
function parsePosProductSearchQuery(raw = "") {
  const trimmed = String(raw).trim();
  if (!trimmed) return { text: "" };
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      return {
        text: "",
        stockNo: parsed.stock_number ?? parsed.stock_no ?? null,
        productId: parsed.id ?? parsed.product_id ?? null,
      };
    } catch {
      /* fall through to text search */
    }
  }
  return { text: trimmed.toLowerCase() };
}

function posProductSelectSql() {
  return `SELECT p.id, p.stock_no, p.product_name, p.quantity, p.retail_price, p.discount, p.gst_id,
          g.tax AS gst_rate, g.type AS gst_type
   FROM products p LEFT JOIN gst g ON g.id = p.gst_id
   WHERE p.status = 1 AND p.published = 1`;
}

function parseInStockOnly(options = {}) {
  const v = options.inStockOnly ?? options.in_stock_only;
  return v === true || v === "true" || v === "1";
}

export async function searchProducts(query = "", options = {}) {
  const parsed = parsePosProductSearchQuery(query);
  const inStockOnly = parseInStockOnly(options);
  const stockFilter = inStockOnly ? " AND p.quantity > 0" : "";
  const baseSql = posProductSelectSql();

  // QR JSON: prefer exact stock_no; fall back to product id only when stock_number is absent.
  if (parsed.stockNo || parsed.productId) {
    if (parsed.stockNo) {
      const [rows] = await db.query(
        `${baseSql}${stockFilter} AND p.stock_no = ? ORDER BY p.product_name`,
        { replacements: [String(parsed.stockNo).trim()] }
      );
      return rows.map(mapProductRow);
    }
    if (parsed.productId != null && parsed.productId !== "") {
      const [rows] = await db.query(
        `${baseSql}${stockFilter} AND p.id = ? ORDER BY p.product_name`,
        { replacements: [Number(parsed.productId)] }
      );
      return rows.map(mapProductRow);
    }
    return [];
  }

  // Plain text search matches stock_no only (not name / productId).
  const value = parsed.text;
  let sql = `${baseSql}${stockFilter}`;
  const params = [];
  if (value) {
    sql += ` AND LOWER(p.stock_no) LIKE ?`;
    params.push(`%${value}%`);
  }
  sql += ` ORDER BY p.product_name`;
  const [rows] = await db.query(sql, { replacements: params });
  return rows.map(mapProductRow);
}

export async function reportDailySummary() {
  const [[sales]] = await db.query(
    `SELECT COUNT(*) AS totalBills, COALESCE(SUM(total),0) AS totalSales FROM transaction_billing
     WHERE bill_type = 'sale' AND status = 'completed' AND DATE(createdon) = CURDATE()`
  );
  const [[returns]] = await db.query(
    `SELECT COALESCE(SUM(total),0) AS totalReturns FROM transaction_billing
     WHERE bill_type = 'return' AND status = 'completed' AND DATE(createdon) = CURDATE()`
  );
  const totalSales = Number(sales.totalSales);
  const totalReturns = Number(returns.totalReturns);
  return {
    totalBills: Number(sales.totalBills),
    totalSales,
    totalReturns,
    netSales: totalSales - totalReturns,
  };
}

export async function reportGstSummary() {
  const [[row]] = await db.query(
    `SELECT COALESCE(SUM(cgst),0) AS cgst, COALESCE(SUM(sgst),0) AS sgst, COALESCE(SUM(gst_total),0) AS total
     FROM transaction_billing WHERE bill_type = 'sale' AND status = 'completed' AND DATE(createdon) = CURDATE()`
  );
  return {
    cgst: Number(row.cgst),
    sgst: Number(row.sgst),
    igst: 0,
    total: Number(row.total),
  };
}

export async function reportPaymentModes() {
  const [rows] = await db.query(
    `SELECT sp.payment_method AS mode, SUM(sp.amount) AS amount
     FROM split_payments sp
     JOIN transaction_billing tb ON tb.id = sp.bill_id
     WHERE tb.bill_type = 'sale' AND tb.status = 'completed' AND DATE(tb.createdon) = CURDATE()
     GROUP BY sp.payment_method`
  );
  const grouped = {};
  for (const r of rows) {
    grouped[paymentModeFromDb(r.mode)] = Number(r.amount);
  }
  return grouped;
}
