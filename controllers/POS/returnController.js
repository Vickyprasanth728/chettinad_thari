import { db, setSessionDefaults } from "../../config/Database.js";
import { sendSuccess, sendError } from "../../Utils/response.js";
import { generateReturnBillNumber } from "../../Utils/OrderNumberGen.js";
import {
  resolveBillId,
  formatReturnListRow,
  formatCreditWalletRow,
  formatBillReturnSummary,
  formatBillLineItem,
  formatCancelListRow,
  formatCancelLineItem,
  formatPaymentRow,
  toNumber,
} from "../../Utils/posResponseHelper.js";
import { CANCELLED_SALE_BILL_WHERE, CANCELLED_LINE_AMOUNT_SQL } from "../../Utils/cancelledBill.js";

async function ensureWallet(customerId, t) {
  await db.query(
    `INSERT IGNORE INTO customer_credit_wallet (customer_id, balance) VALUES (?, 0)`,
    { replacements: [customerId], transaction: t }
  );
}

export const createReturn = async (req, res) => {
  const t = await db.transaction();
  try {
    await setSessionDefaults();
    const { parent_bill_id, items, reason, refund_method = "credit" } = req.body;

    if (!parent_bill_id || !items?.length) {
      await t.rollback();
      return sendError(res, "parent_bill_id and items are required", 400);
    }

    const [[parent]] = await db.query(
      `SELECT * FROM transaction_billing WHERE id = ? AND bill_type = 'sale'`,
      { replacements: [parent_bill_id], transaction: t }
    );
    if (!parent) {
      await t.rollback();
      return sendError(res, "Parent bill not found", 404);
    }
    if (parent.status === "cancelled") {
      await t.rollback();
      return sendError(res, "Cannot return against a cancelled bill", 400);
    }

    let returnSubtotal = 0;
    let returnGst = 0;
    const returnLines = [];

    for (const item of items) {
      const productId = item.product_id ?? item.id;
      const [[orig]] = await db.query(
        `SELECT t.*, p.product_name FROM transactions t JOIN products p ON p.id = t.product_id
         WHERE t.bill_id = ? AND t.product_id = ?`,
        { replacements: [parent_bill_id, productId], transaction: t }
      );
      if (!orig) {
        await t.rollback();
        return sendError(res, `Product ${productId} not in original bill`, 400);
      }

      const [[returned]] = await db.query(
        `SELECT COALESCE(SUM(t.quantity),0) AS qty FROM transactions t
         JOIN transaction_billing tb ON tb.id = t.bill_id
         WHERE tb.parent_bill_id = ? AND t.product_id = ? AND tb.bill_type = 'return' AND tb.status != 'cancelled'`,
        { replacements: [parent_bill_id, productId], transaction: t }
      );
      if (Number(returned.qty) + item.quantity > orig.quantity) {
        await t.rollback();
        return sendError(res, `Return qty exceeds returnable qty for ${orig.product_name}`, 400);
      }

      const lineBase = orig.unit_price * item.quantity;
      const gstPart = (orig.gst_amount / orig.quantity) * item.quantity;
      returnSubtotal += lineBase;
      returnGst += gstPart;
      returnLines.push({ item, orig, gstPart, lineTotal: lineBase + gstPart });
    }

    const returnTotal = returnSubtotal + returnGst;
    const billNo = await generateReturnBillNumber();

    const [returnBillId] = await db.query(
      `INSERT INTO transaction_billing (bill_no, bill_type, parent_bill_id, customer_id, staff_id, subtotal, gst_total, total, status)
       VALUES (?, 'return', ?, ?, ?, ?, ?, ?, 'completed')`,
      {
        replacements: [billNo, parent_bill_id, parent.customer_id, req.user?.id, returnSubtotal, returnGst, returnTotal],
        transaction: t,
      }
    );

    for (const rl of returnLines) {
      await db.query(
        `INSERT INTO transactions (bill_id, product_id, stock_no, quantity, unit_price, gst_amount, line_total, status, createdby)
         VALUES (?,?,?,?,?,?,?,1,?)`,
        {
          replacements: [
            returnBillId, rl.orig.product_id, rl.orig.stock_no, rl.item.quantity,
            rl.orig.unit_price, rl.gstPart, rl.lineTotal, req.user?.id || null,
          ],
          transaction: t,
        }
      );
      const [[p]] = await db.query(`SELECT quantity FROM products WHERE id = ? FOR UPDATE`, {
        replacements: [rl.orig.product_id],
        transaction: t,
      });
      const afterQty = p.quantity + rl.item.quantity;
      await db.query(`UPDATE products SET quantity = ? WHERE id = ?`, {
        replacements: [afterQty, rl.orig.product_id],
        transaction: t,
      });
      await db.query(
        `INSERT INTO inventory_logs (product_id, staff_id, action_type, quantity_changed, before_qty, after_qty, reference_type, reference_id, notes)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        {
          replacements: [
            rl.orig.product_id, req.user?.id, "return", rl.item.quantity,
            p.quantity, afterQty, "return_bill", billNo, reason,
          ],
          transaction: t,
        }
      );
    }

    if (refund_method === "credit" && parent.customer_id) {
      await ensureWallet(parent.customer_id, t);
      await db.query(
        `UPDATE customer_credit_wallet SET balance = balance + ? WHERE customer_id = ?`,
        { replacements: [returnTotal, parent.customer_id], transaction: t }
      );
      await db.query(
        `INSERT INTO customer_credit_logs (customer_id, amount, type, bill_ref, notes) VALUES (?,?,?,?,?)`,
        { replacements: [parent.customer_id, returnTotal, "credit", billNo, reason || "Return credit"], transaction: t }
      );
    }

    await t.commit();
    return sendSuccess(res, "Return bill created", {
      return_bill_id: returnBillId,
      bill_no: billNo,
      parent_bill_id,
      total: returnTotal,
    });
  } catch (error) {
    await t.rollback();
    return sendError(res, error.message, 500);
  }
};

export const listReturns = async (req, res) => {
  try {
    const { search, from, to, page = 1, limit = 20 } = req.query;
    let where = `WHERE tb.bill_type = 'return'`;
    const params = [];

    if (from && to) {
      where += ` AND DATE(tb.createdon) BETWEEN ? AND ?`;
      params.push(from, to);
    }
    const q = (search || "").trim();
    if (q) {
      where += ` AND (tb.bill_no LIKE ? OR parent.bill_no LIKE ? OR bc.name LIKE ? OR bc.mobile LIKE ?)`;
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total
       FROM transaction_billing tb
       LEFT JOIN transaction_billing parent ON parent.id = tb.parent_bill_id
       LEFT JOIN billing_customers bc ON bc.id = tb.customer_id
       ${where}`,
      { replacements: params }
    );

    const [rows] = await db.query(
      `SELECT tb.id, tb.bill_no AS return_bill_no, tb.createdon AS return_date,
              tb.total AS total_amount, tb.status,
              parent.bill_no AS parent_bill_no, parent.id AS parent_bill_id,
              bc.name AS customer_name, bc.mobile
       FROM transaction_billing tb
       LEFT JOIN transaction_billing parent ON parent.id = tb.parent_bill_id
       LEFT JOIN billing_customers bc ON bc.id = tb.customer_id
       ${where}
       ORDER BY tb.createdon DESC
       LIMIT ? OFFSET ?`,
      { replacements: [...params, parseInt(limit, 10), offset] }
    );

    return sendSuccess(res, "Returns fetched", {
      rows: rows.map(formatReturnListRow),
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total: Number(total),
    });
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const listCreditWallets = async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    let where = `WHERE 1=1`;
    const params = [];
    const q = (search || "").trim();
    if (q) {
      where += ` AND (bc.name LIKE ? OR bc.mobile LIKE ?)`;
      const like = `%${q}%`;
      params.push(like, like);
    }

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total
       FROM customer_credit_wallet w
       JOIN billing_customers bc ON bc.id = w.customer_id
       ${where}`,
      { replacements: params }
    );

    const [rows] = await db.query(
      `SELECT bc.id AS customer_id, bc.name AS customer_name, bc.mobile,
              w.balance AS credit_balance, w.updatedon AS last_updated,
              COALESCE((SELECT SUM(amount) FROM customer_credit_logs
                        WHERE customer_id = bc.id AND type = 'credit'), 0) AS total_earned,
              COALESCE((SELECT SUM(amount) FROM customer_credit_logs
                        WHERE customer_id = bc.id AND type = 'debit'), 0) AS total_redeemed
       FROM customer_credit_wallet w
       JOIN billing_customers bc ON bc.id = w.customer_id
       ${where}
       ORDER BY w.updatedon DESC
       LIMIT ? OFFSET ?`,
      { replacements: [...params, parseInt(limit, 10), offset] }
    );

    return sendSuccess(res, "Credit wallets", {
      rows: rows.map(formatCreditWalletRow),
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total: Number(total),
    });
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const listCancellations = async (req, res) => {
  try {
    const { search, from, to, page = 1, limit = 20 } = req.query;
    let where = `WHERE tb.bill_type = 'sale' AND ${CANCELLED_SALE_BILL_WHERE}`;
    const params = [];

    if (from && to) {
      where += ` AND DATE(tb.createdon) BETWEEN ? AND ?`;
      params.push(from, to);
    }
    const q = (search || "").trim();
    if (q) {
      where += ` AND (tb.bill_no LIKE ? OR bc.name LIKE ? OR bc.mobile LIKE ?)`;
      const like = `%${q}%`;
      params.push(like, like, like);
    }

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total
       FROM transaction_billing tb
       LEFT JOIN billing_customers bc ON bc.id = tb.customer_id
       ${where}`,
      { replacements: params }
    );

    const [rows] = await db.query(
      `SELECT tb.id, tb.bill_no, tb.createdon AS cancel_date, tb.status, tb.cancellation_reason,
              CASE WHEN tb.status = 'cancelled' THEN 'full' ELSE 'partial' END AS cancel_type,
              bc.name AS customer_name, bc.mobile,
              COALESCE(SUM(${CANCELLED_LINE_AMOUNT_SQL}), 0) AS cancelled_amount
       FROM transaction_billing tb
       JOIN transactions t ON t.bill_id = tb.id
       LEFT JOIN billing_customers bc ON bc.id = tb.customer_id
       ${where}
       GROUP BY tb.id, tb.bill_no, tb.createdon, tb.status, tb.cancellation_reason, bc.name, bc.mobile
       ORDER BY tb.createdon DESC
       LIMIT ? OFFSET ?`,
      { replacements: [...params, parseInt(limit, 10), offset] }
    );

    return sendSuccess(res, "Cancellations fetched", {
      rows: rows.map(formatCancelListRow),
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total: Number(total),
    });
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const getCancellation = async (req, res) => {
  try {
    const [[bill]] = await db.query(
      `SELECT tb.*, bc.name AS customer_name, bc.mobile, bc.email, bc.gst_number AS customer_gst,
              u.name AS staff_name
       FROM transaction_billing tb
       LEFT JOIN billing_customers bc ON bc.id = tb.customer_id
       LEFT JOIN users u ON u.id = tb.staff_id
       WHERE (tb.id = ? OR tb.bill_no = ?) AND tb.bill_type = 'sale' AND ${CANCELLED_SALE_BILL_WHERE}`,
      { replacements: [req.params.id, req.params.id] }
    );
    if (!bill) return sendError(res, "Cancellation not found", 404);

    const [items] = await db.query(
      `SELECT t.*, p.product_name FROM transactions t
       JOIN products p ON p.id = t.product_id
       WHERE t.bill_id = ?
         AND (t.cancelled_qty > 0 OR t.status = 0 OR ? = 'cancelled')`,
      { replacements: [bill.id, bill.status] }
    );

    const [payments] = await db.query(
      `SELECT id, payment_method, amount FROM split_payments WHERE bill_id = ?`,
      { replacements: [bill.id] }
    );

    const cancelType = bill.status === "cancelled" ? "full" : "partial";
    const cancelledAmount = items.reduce(
      (sum, line) => sum + formatCancelLineItem(line, bill.status).cancelled_amount,
      0
    );

    return sendSuccess(res, "Cancellation detail", {
      id: bill.id,
      bill_no: bill.bill_no,
      cancel_date: bill.createdon,
      cancel_type: cancelType,
      status: bill.status,
      cancellation_reason: bill.cancellation_reason ?? "",
      customer_id: bill.customer_id,
      customer_name: bill.customer_name,
      mobile: bill.mobile,
      email: bill.email,
      customer_gst: bill.customer_gst ?? "",
      staff_id: bill.staff_id,
      staff_name: bill.staff_name,
      subtotal: toNumber(bill.subtotal),
      gst_total: toNumber(bill.gst_total),
      total: toNumber(bill.total),
      cancelled_amount: Math.round(cancelledAmount * 100) / 100,
      items: items.map((line) => formatCancelLineItem(line, bill.status)),
      payments: payments.map(formatPaymentRow),
    });
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const getReturn = async (req, res) => {
  try {
    const [[bill]] = await db.query(
      `SELECT tb.*, tb.bill_no AS return_bill_no, parent.bill_no AS parent_bill_no,
              bc.name AS customer_name, bc.mobile, bc.email, bc.gst_number AS customer_gst,
              u.name AS staff_name
       FROM transaction_billing tb
       LEFT JOIN transaction_billing parent ON parent.id = tb.parent_bill_id
       LEFT JOIN billing_customers bc ON bc.id = tb.customer_id
       LEFT JOIN users u ON u.id = tb.staff_id
       WHERE (tb.id = ? OR tb.bill_no = ?) AND tb.bill_type = 'return'`,
      { replacements: [req.params.id, req.params.id] }
    );
    if (!bill) return sendError(res, "Not found", 404);

    const [items] = await db.query(
      `SELECT t.*, p.product_name FROM transactions t JOIN products p ON p.id = t.product_id WHERE t.bill_id = ?`,
      { replacements: [bill.id] }
    );

    return sendSuccess(res, "Return bill", {
      ...bill,
      return_bill_no: bill.return_bill_no ?? bill.bill_no,
      subtotal: toNumber(bill.subtotal),
      gst_total: toNumber(bill.gst_total),
      total: toNumber(bill.total),
      items: items.map((line) => formatBillLineItem(line)),
    });
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const getBillReturns = async (req, res) => {
  try {
    const parentId = await resolveBillId(req.params.billId);
    if (!parentId) return sendError(res, "Bill not found", 404);

    const [returns] = await db.query(
      `SELECT id, bill_no, parent_bill_id, total, status, createdon
       FROM transaction_billing
       WHERE parent_bill_id = ? AND bill_type = 'return'
       ORDER BY createdon DESC`,
      { replacements: [parentId] }
    );

    return sendSuccess(res, "Returns for bill", returns.map(formatBillReturnSummary));
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const cancelBill = async (req, res) => {
  const t = await db.transaction();
  try {
    const { bill_id, cancellation_reason, staff_id } = req.body;
    if (!bill_id) {
      await t.rollback();
      return sendError(res, "bill_id is required", 400);
    }

    const [[bill]] = await db.query(
      `SELECT * FROM transaction_billing WHERE id = ? AND bill_type = 'sale' FOR UPDATE`,
      { replacements: [bill_id], transaction: t }
    );
    if (!bill) {
      await t.rollback();
      return sendError(res, "Bill not found", 404);
    }
    if (bill.status === "cancelled") {
      await t.rollback();
      return sendError(res, "Already cancelled", 400);
    }

    const [items] = await db.query(`SELECT * FROM transactions WHERE bill_id = ?`, {
      replacements: [bill_id],
      transaction: t,
    });

    for (const item of items) {
      const [[p]] = await db.query(`SELECT quantity FROM products WHERE id = ? FOR UPDATE`, {
        replacements: [item.product_id],
        transaction: t,
      });
      const afterQty = p.quantity + item.quantity;
      await db.query(`UPDATE products SET quantity = ? WHERE id = ?`, {
        replacements: [afterQty, item.product_id],
        transaction: t,
      });
      await db.query(
        `INSERT INTO inventory_logs (product_id, staff_id, action_type, quantity_changed, before_qty, after_qty, reference_type, reference_id, notes)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        {
          replacements: [
            item.product_id, staff_id || req.user?.id, "cancel", item.quantity,
            p.quantity, afterQty, "cancel_bill", bill.bill_no, cancellation_reason,
          ],
          transaction: t,
        }
      );
    }

    await db.query(
      `UPDATE transaction_billing SET status = 'cancelled', cancellation_reason = ? WHERE id = ?`,
      { replacements: [cancellation_reason, bill_id], transaction: t }
    );
    await t.commit();
    return sendSuccess(res, "Bill cancelled");
  } catch (error) {
    await t.rollback();
    return sendError(res, error.message, 500);
  }
};

export const getCreditBalance = async (req, res) => {
  const [[w]] = await db.query(`SELECT balance FROM customer_credit_wallet WHERE customer_id = ?`, {
    replacements: [req.params.customerId],
  });
  return sendSuccess(res, "Credit balance", { balance: toNumber(w?.balance) });
};

export const getCreditHistory = async (req, res) => {
  try {
    const [logs] = await db.query(
      `SELECT id, customer_id, amount, type, bill_ref, notes, createdon
       FROM customer_credit_logs WHERE customer_id = ? ORDER BY createdon DESC`,
      { replacements: [req.params.customerId] }
    );
    return sendSuccess(
      res,
      "Credit history",
      logs.map((row) => ({
        ...row,
        amount: toNumber(row.amount),
      }))
    );
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const adjustCredit = async (req, res) => {
  const t = await db.transaction();
  try {
    const { customer_id, amount, type, notes } = req.body;
    await ensureWallet(customer_id, t);
    const delta = type === "credit" ? Number(amount) : -Number(amount);
    await db.query(`UPDATE customer_credit_wallet SET balance = balance + ? WHERE customer_id = ?`, {
      replacements: [delta, customer_id],
      transaction: t,
    });
    await db.query(
      `INSERT INTO customer_credit_logs (customer_id, amount, type, notes) VALUES (?,?,?,?)`,
      { replacements: [customer_id, amount, type, notes || "Manual adjustment"], transaction: t }
    );
    await t.commit();
    return sendSuccess(res, "Credit adjusted");
  } catch (error) {
    await t.rollback();
    return sendError(res, error.message, 500);
  }
};
