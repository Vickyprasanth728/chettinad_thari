import { db, setSessionDefaults } from "../../config/Database.js";
import { htmlToPdfBuffer, sendPdf } from "../../Utils/pdfHelper.js";
import { buildInvoicePdfHtml } from "../../Utils/pdfReportHtml.js";
import { getReceiptTemplateHtml } from "../Admin/Settings/settingsController.js";
import { sendSuccess, sendError, sendData } from "../../Utils/response.js";
import { generateBillNumber } from "../../Utils/OrderNumberGen.js";
import { calculateGST } from "../../Utils/gstCalculator.js";
import { normalizePaymentMethod, formatPaymentMethod } from "../../Utils/paymentMethodHelper.js";
import { logInfo } from "../../logs/LogController.js";
import {
  formatBillListRow,
  formatBillDetail,
  formatBillLineItem,
} from "../../Utils/posResponseHelper.js";

async function upsertCustomer(customer) {
  if (!customer?.name) return null;
  const { name, email, mobile, gst_number } = customer;
  if (customer.id) return customer.id;
  const [id] = await db.query(
    `INSERT INTO billing_customers (name, email, mobile, gst_number) VALUES (?,?,?,?)`,
    { replacements: [name, email || null, mobile || null, gst_number || null] }
  );
  return id;
}

export const getPosInit = async (req, res) => {
  const [staff] = await db.query(
    `SELECT u.id, u.name, u.username FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.status = 1 AND r.name IN ('Billing Staff','Admin')`
  );
  const paymentMethods = ["cash", "card", "upi", "net_banking", "online", "credit"];
  return sendSuccess(res, "POS init", { staff, paymentMethods });
};

export const previewBillNumber = async (req, res) => {
  const billNo = await generateBillNumber();
  return sendSuccess(res, "Next bill number", { bill_no: billNo });
};

export const checkBillingQuantity = async (req, res) => {
  const { items } = req.body;
  const issues = [];
  for (const item of items) {
    const pid = item.id ?? item.product_id;
    const [[p]] = await db.query(`SELECT quantity, product_name FROM products WHERE id = ?`, {
      replacements: [pid],
    });
    if (!p || p.quantity < item.quantity) {
      issues.push({ id: pid, available: p?.quantity || 0 });
    }
  }
  if (issues.length) return sendError(res, "Insufficient stock", 400, issues);
  return sendSuccess(res, "Stock available");
};

export const insertBilling = async (req, res) => {
  const t = await db.transaction();
  try {
    await setSessionDefaults();
    const {
      staff_id, manual_order_number, customer, items, bill_discount = 0,
      payments, credit_to_apply = 0, notes,
    } = req.body;

    if (!items?.length) return sendError(res, "Items required");
    if (!payments?.length) return sendError(res, "Payments required");

    const paymentTotal = payments.reduce((s, p) => s + Number(p.amount), 0);
    let subtotal = 0;
    let gstTotal = 0;
    let cgstTotal = 0;
    let sgstTotal = 0;
    const lineCalcs = [];

    for (const item of items) {
      const pid = item.id ?? item.product_id;
      const [[p]] = await db.query(
        `SELECT p.*, g.tax, g.type AS gst_type FROM products p LEFT JOIN gst g ON g.id = p.gst_id WHERE p.id = ? FOR UPDATE`,
        { replacements: [pid], transaction: t }
      );
      if (!p) throw new Error(`Product ${pid} not found`);
      if (p.quantity < item.quantity) throw new Error(`Insufficient stock for ${p.product_name}`);

      const unitPrice = Number(item.unit_price ?? p.retail_price) - Number(item.discount || p.discount || 0);
      const lineBase = unitPrice * item.quantity;
      let gstAmount = 0;
      let cgst = 0;
      let sgst = 0;

      if (p.gst_id) {
        const gstCalc = await calculateGST(p.gst_id, unitPrice);
        gstAmount = gstCalc.gstprice * item.quantity;
        cgst = gstCalc.cgst * item.quantity;
        sgst = gstCalc.sgst * item.quantity;
      }

      const lineTotal = p.gst_id && p.gst_type === "exclusive" ? lineBase + gstAmount : lineBase;
      subtotal += lineBase;
      gstTotal += gstAmount;
      cgstTotal += cgst;
      sgstTotal += sgst;

      lineCalcs.push({ item, p, unitPrice, lineBase, gstAmount, cgst, sgst, lineTotal });
    }

    let total = subtotal + gstTotal - Number(bill_discount);
    const creditApplied = Math.min(Number(credit_to_apply) || 0, total);
    total -= creditApplied;

    if (Math.abs(paymentTotal + creditApplied - (subtotal + gstTotal - Number(bill_discount))) > 0.05) {
      throw new Error(`Payment total (${paymentTotal + creditApplied}) does not match bill total`);
    }

    const customerId = await upsertCustomer(customer);
    const billNo = await generateBillNumber();

    if (creditApplied > 0) {
      if (!customerId) throw new Error("Customer required to apply credit");
      await db.query(
        `INSERT IGNORE INTO customer_credit_wallet (customer_id, balance) VALUES (?, 0)`,
        { replacements: [customerId], transaction: t }
      );
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
          billNo, customerId, staff_id || req.user?.id, manual_order_number || null,
          subtotal, bill_discount, gstTotal, cgstTotal, sgstTotal, total, creditApplied,
        ],
      },
      { transaction: t }
    );

    for (const lc of lineCalcs) {
      await db.query(
        `INSERT INTO transactions (bill_id, product_id, stock_no, quantity, unit_price, discount, gst_id, gst_amount, cgst, sgst, line_total, status, createdby)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?)`,
        {
          replacements: [
            billId, lc.p.id, lc.p.stock_no, lc.item.quantity, lc.unitPrice,
            lc.item.discount || 0, lc.p.gst_id, lc.gstAmount, lc.cgst, lc.sgst, lc.lineTotal,
            staff_id || req.user?.id || null,
          ],
        },
        { transaction: t }
      );
      const beforeQty = lc.p.quantity;
      const afterQty = beforeQty - lc.item.quantity;
      await db.query(`UPDATE products SET quantity = ? WHERE id = ?`, {
        replacements: [afterQty, lc.p.id],
        transaction: t,
      });
      await db.query(
        `INSERT INTO inventory_logs (product_id, staff_id, action_type, quantity_changed, before_qty, after_qty, reference_type, reference_id)
         VALUES (?,?,?,?,?,?,?,?)`,
        {
          replacements: [
            lc.p.id, staff_id || req.user?.id, "sale", lc.item.quantity,
            beforeQty, afterQty, "bill", billNo,
          ],
        },
        { transaction: t }
      );
    }

    for (const pay of payments) {
      await db.query(
        `INSERT INTO split_payments (bill_id, payment_method, amount) VALUES (?,?,?)`,
        { replacements: [billId, pay.method, pay.amount], transaction: t }
      );
    }

    if (creditApplied > 0 && customerId) {
      await db.query(
        `UPDATE customer_credit_wallet SET balance = balance - ? WHERE customer_id = ?`,
        { replacements: [creditApplied, customerId], transaction: t }
      );
      await db.query(
        `INSERT INTO customer_credit_logs (customer_id, amount, type, bill_ref, notes) VALUES (?,?,?,?,?)`,
        { replacements: [customerId, creditApplied, "debit", billNo, "Applied on purchase"], transaction: t }
      );
    }

    await t.commit();
    return sendSuccess(res, "Bill created", { bill_id: billId, bill_no: billNo, total });
  } catch (error) {
    await t.rollback();
    return sendError(res, error.message, 500);
  }
};

export const listBills = async (req, res) => {
  try {
    const {
      search,
      bill_no,
      from,
      to,
      customer,
      payment_method,
      staff_id,
      status,
      page = 1,
      limit = 20,
    } = req.query;

    let where = `WHERE tb.bill_type = 'sale'`;
    const params = [];

    if (bill_no) {
      where += ` AND tb.bill_no LIKE ?`;
      params.push(`%${bill_no}%`);
    }
    if (from && to) {
      where += ` AND DATE(tb.createdon) BETWEEN ? AND ?`;
      params.push(from, to);
    }
    if (staff_id) {
      where += ` AND tb.staff_id = ?`;
      params.push(Number(staff_id));
    }
    if (status) {
      where += ` AND tb.status = ?`;
      params.push(status);
    }
    if (payment_method) {
      const normalized = normalizePaymentMethod(payment_method);
      if (normalized) {
        where += ` AND EXISTS (SELECT 1 FROM split_payments sp WHERE sp.bill_id = tb.id AND sp.payment_method = ?)`;
        params.push(normalized);
      }
    }
    const customerQ = (customer || search || "").trim();
    if (customerQ) {
      where += ` AND (tb.bill_no LIKE ? OR bc.name LIKE ? OR bc.mobile LIKE ?)`;
      const like = `%${customerQ}%`;
      params.push(like, like, like);
    }

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [[{ total }]] = await db.query(
      `SELECT COUNT(DISTINCT tb.id) AS total
       FROM transaction_billing tb
       LEFT JOIN billing_customers bc ON bc.id = tb.customer_id
       ${where}`,
      { replacements: params }
    );

    const [rows] = await db.query(
      `SELECT tb.id, tb.bill_no, tb.createdon, tb.subtotal, tb.discount, tb.gst_total,
              tb.total, tb.credit_applied, tb.payment_status, tb.status, tb.manual_order_number,
              bc.name AS customer_name, bc.mobile AS customer_mobile,
              u.name AS staff_name,
              (SELECT GROUP_CONCAT(DISTINCT sp.payment_method ORDER BY sp.payment_method SEPARATOR ', ')
               FROM split_payments sp WHERE sp.bill_id = tb.id) AS payment_methods,
              (SELECT COUNT(*) FROM transactions t WHERE t.bill_id = tb.id) AS item_count
       FROM transaction_billing tb
       LEFT JOIN billing_customers bc ON bc.id = tb.customer_id
       LEFT JOIN users u ON u.id = tb.staff_id
       ${where}
       ORDER BY tb.createdon DESC
       LIMIT ? OFFSET ?`,
      { replacements: [...params, parseInt(limit, 10), offset] }
    );

    return sendSuccess(res, "Bills fetched", {
      rows: rows.map(formatBillListRow),
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total: Number(total),
    });
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

function buildReceiptAggregates(orderRows) {
  const categoryData = {};
  const gstSummary = {};

  for (const row of orderRows) {
    const category = row.category_name || "Uncategorized";
    if (!categoryData[category]) categoryData[category] = [];
    categoryData[category].push({
      product_name: row.product_name,
      quantity: Number(row.quantity),
      price: Number(row.price),
      gst_tax: row.gst_tax != null ? Number(row.gst_tax) : null,
      gst_amount: Number(row.gst_amount || 0),
      stock_no: row.stock_no,
      line_total: Number(row.line_total),
    });

    if (row.gst_tax != null) {
      const rate = String(row.gst_tax);
      if (!gstSummary[rate]) gstSummary[rate] = 0;
      gstSummary[rate] += Number(row.gst_amount || 0);
    }
  }

  return { categoryData, gstSummary };
}

/** Receipt / print data for billing */
export const printReceipt = async (req, res) => {
  try {
    const billKey = req.params.billId;
    const [[bill]] = await db.query(
      `SELECT tb.id, tb.bill_no, tb.bill_type, tb.status, tb.payment_status,
              tb.subtotal, tb.discount, tb.gst_total, tb.cgst, tb.sgst, tb.total,
              tb.credit_applied, tb.manual_order_number, tb.createdon,
              DATE_FORMAT(tb.createdon, '%b %e, %Y') AS created_date,
              DATE_FORMAT(tb.createdon, '%h:%i %p') AS created_time,
              bc.name AS customer_name, bc.mobile AS customer_mobile,
              bc.gst_number AS customer_gst, u.name AS staff_name
       FROM transaction_billing tb
       LEFT JOIN billing_customers bc ON bc.id = tb.customer_id
       LEFT JOIN users u ON u.id = tb.staff_id
       WHERE tb.id = ? OR tb.bill_no = ?`,
      { replacements: [billKey, billKey] }
    );

    if (!bill) {
      return res.status(404).json({ status: false, message: "Bill not found" });
    }

    const [orderDetails] = await db.query(
      `SELECT p.product_name, pc.name AS category_name, t.unit_price AS price,
              t.quantity, CAST(g.tax AS DECIMAL(10,1)) AS gst_tax, t.gst_amount,
              t.stock_no, t.line_total, t.cgst, t.sgst, t.discount AS line_discount
       FROM transactions t
       LEFT JOIN products p ON p.id = t.product_id
       LEFT JOIN product_categories pc ON pc.id = p.category_id
       LEFT JOIN gst g ON g.id = t.gst_id
       WHERE t.bill_id = ?`,
      { replacements: [bill.id] }
    );

    if (!orderDetails.length) {
      logInfo("No order details found for this bill", "Print receipt");
      return res.status(404).json({
        status: false,
        message: "No order details found for this bill",
      });
    }

    const [payments] = await db.query(
      `SELECT payment_method, amount FROM split_payments WHERE bill_id = ?`,
      { replacements: [bill.id] }
    );

    const { categoryData, gstSummary } = buildReceiptAggregates(orderDetails);

    const billingInfo = {
      bill_no: bill.bill_no,
      bill_id: bill.id,
      bill_type: bill.bill_type,
      status: bill.status,
      billing_status: bill.payment_status,
      subtotal: Number(bill.subtotal),
      discount: Number(bill.discount),
      gst_total: Number(bill.gst_total),
      cgst: Number(bill.cgst),
      sgst: Number(bill.sgst),
      total_amount: Number(bill.total),
      credit_applied: Number(bill.credit_applied),
      created_date: bill.created_date,
      created_time: bill.created_time,
      customer_name: bill.customer_name,
      customer_mobile: bill.customer_mobile,
      customer_gst: bill.customer_gst,
      staff_name: bill.staff_name,
      manual_order_number: bill.manual_order_number ?? "",
    };

    const orders = orderDetails.map((row) => ({
      product_name: row.product_name,
      category_name: row.category_name,
      price: Number(row.price),
      quantity: Number(row.quantity),
      gst_tax: row.gst_tax != null ? Number(row.gst_tax) : null,
      gst_amount: Number(row.gst_amount || 0),
      stock_no: row.stock_no,
      line_total: Number(row.line_total),
      cgst: Number(row.cgst || 0),
      sgst: Number(row.sgst || 0),
      line_discount: Number(row.line_discount || 0),
    }));

    const receiptHtml = await getReceiptTemplateHtml();

    return sendData(res, {
      bill: billingInfo,
      orders,
      payments: payments.map((p) => ({
        payment_method: formatPaymentMethod(p.payment_method),
        amount: Number(p.amount),
      })),
      category_data: categoryData,
      gst_summary: gstSummary,
      receipt_html: receiptHtml,
    });
  } catch (error) {
    console.error("Error in printReceipt:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal server error",
    });
  }
};

export const getBill = async (req, res) => {
  try {
    const [[bill]] = await db.query(
      `SELECT tb.*, bc.name AS customer_name, bc.email, bc.mobile AS customer_mobile,
              bc.gst_number AS customer_gst, u.name AS staff_name
       FROM transaction_billing tb
       LEFT JOIN billing_customers bc ON bc.id = tb.customer_id
       LEFT JOIN users u ON u.id = tb.staff_id
       WHERE tb.id = ? OR tb.bill_no = ?`,
      { replacements: [req.params.billId, req.params.billId] }
    );
    if (!bill) return sendError(res, "Bill not found", 404);

    const [items] = await db.query(
      `SELECT t.*, p.product_name FROM transactions t JOIN products p ON p.id = t.product_id WHERE t.bill_id = ?`,
      { replacements: [bill.id] }
    );
    const [payments] = await db.query(`SELECT id, payment_method, amount FROM split_payments WHERE bill_id = ?`, {
      replacements: [bill.id],
    });

    const [returnedRows] = await db.query(
      `SELECT t.product_id, COALESCE(SUM(t.quantity), 0) AS returned_qty
       FROM transactions t
       JOIN transaction_billing tb ON tb.id = t.bill_id
       WHERE tb.parent_bill_id = ? AND tb.bill_type = 'return' AND tb.status != 'cancelled'
       GROUP BY t.product_id`,
      { replacements: [bill.id] }
    );
    const returnedByProduct = Object.fromEntries(
      returnedRows.map((r) => [r.product_id, Number(r.returned_qty)])
    );

    const itemsWithReturnable = items.map((line) =>
      formatBillLineItem(line, returnedByProduct[line.product_id] || 0)
    );

    return sendSuccess(res, "Bill detail", formatBillDetail(bill, itemsWithReturnable, payments));
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const getInvoicePdf = async (req, res) => {
  try {
    const result = await getBillData(req.params.billId);
    if (!result) return sendError(res, "Bill not found", 404);

    const { bill, items, payments } = result;
    const html = buildInvoicePdfHtml(bill, items, payments);
    const pdf = await htmlToPdfBuffer(html);
    return sendPdf(res, pdf, `invoice_${bill.bill_no}`);
  } catch (error) {
    return sendError(res, error.message || "Failed to generate PDF", 500);
  }
};

async function getBillData(billId) {
  const [[bill]] = await db.query(
    `SELECT tb.*, bc.name AS customer_name, bc.email, bc.mobile, bc.gst_number AS customer_gst, u.name AS staff_name
     FROM transaction_billing tb
     LEFT JOIN billing_customers bc ON bc.id = tb.customer_id
     LEFT JOIN users u ON u.id = tb.staff_id
     WHERE tb.id = ? OR tb.bill_no = ?`,
    { replacements: [billId, billId] }
  );
  if (!bill) return null;
  const [items] = await db.query(
    `SELECT t.*, p.product_name FROM transactions t JOIN products p ON p.id = t.product_id WHERE t.bill_id = ?`,
    { replacements: [bill.id] }
  );
  const [payments] = await db.query(`SELECT * FROM split_payments WHERE bill_id = ?`, {
    replacements: [bill.id],
  });
  return { bill, items, payments };
}
