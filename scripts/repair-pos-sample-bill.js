/**
 * Removes inconsistent CT-S-2026-001 sample data and re-inserts aligned header + line items.
 * Usage: node scripts/repair-pos-sample-bill.js
 */
import dotenv from "dotenv";
import { db, connectDB, setSessionDefaults } from "../config/Database.js";

dotenv.config();

const SALE_BILL_NO = "CT-S-2026-001";
const RETURN_BILL_NO = "CT-R-2026-001";

async function deleteSampleBills(t) {
  const [[sale]] = await db.query(
    `SELECT id FROM transaction_billing WHERE bill_no = ?`,
    { replacements: [SALE_BILL_NO], transaction: t }
  );
  if (!sale) return null;

  const saleId = sale.id;

  const [returns] = await db.query(
    `SELECT id FROM transaction_billing WHERE parent_bill_id = ? OR bill_no = ?`,
    { replacements: [saleId, RETURN_BILL_NO], transaction: t }
  );

  for (const ret of returns) {
    await db.query(`DELETE FROM transactions WHERE bill_id = ?`, {
      replacements: [ret.id],
      transaction: t,
    });
    await db.query(`DELETE FROM transaction_billing WHERE id = ?`, {
      replacements: [ret.id],
      transaction: t,
    });
  }

  await db.query(`DELETE FROM split_payments WHERE bill_id = ?`, {
    replacements: [saleId],
    transaction: t,
  });
  await db.query(`DELETE FROM transactions WHERE bill_id = ?`, {
    replacements: [saleId],
    transaction: t,
  });
  await db.query(`DELETE FROM transaction_billing WHERE id = ?`, {
    replacements: [saleId],
    transaction: t,
  });

  await db.query(
    `DELETE FROM customer_credit_logs WHERE bill_ref IN (?, ?)`,
    { replacements: [SALE_BILL_NO, RETURN_BILL_NO], transaction: t }
  );

  return saleId;
}

async function insertSampleBills(t, staffId, silkId, cottonId) {
  // Line items: silk 8925 + cotton x2 4620 = 13545 total (5% GST, intrastate)
  const subtotal = 12900;
  const gstTotal = 645;
  const cgst = 322.5;
  const sgst = 322.5;
  const total = 13545;
  const creditApplied = 2000;

  const [saleBillId] = await db.query(
    `INSERT INTO transaction_billing
     (bill_no, bill_type, customer_id, staff_id, subtotal, discount, gst_total, cgst, sgst, igst,
      total, credit_applied, payment_status, status, createdon)
     VALUES (?, 'sale', 1, ?, ?, 0, ?, ?, ?, 0, ?, ?, 'paid', 'completed', '2026-05-28 10:15:00')`,
    {
      replacements: [SALE_BILL_NO, staffId, subtotal, gstTotal, cgst, sgst, total, creditApplied],
      transaction: t,
    }
  );

  await db.query(
    `INSERT INTO transactions
     (bill_id, product_id, stock_no, quantity, unit_price, gst_amount, cgst, sgst, igst, line_total, status, createdby)
     VALUES
     (?, ?, 'CT-001', 1, 8500, 425, 212.5, 212.5, 0, 8925, 1, ?),
     (?, ?, 'CT-002', 2, 2200, 220, 110, 110, 0, 4620, 1, ?)`,
    { replacements: [saleBillId, silkId, staffId, saleBillId, cottonId, staffId], transaction: t }
  );

  await db.query(
    `INSERT INTO split_payments (bill_id, payment_method, amount) VALUES
     (?, 'cash', 8000),
     (?, 'upi', 3545)`,
    { replacements: [saleBillId, saleBillId], transaction: t }
  );

  const returnTaxable = 2095.24;
  const returnGst = 104.76;
  const returnCgst = 52.38;
  const returnSgst = 52.38;
  const returnTotal = 2200;

  const [returnBillId] = await db.query(
    `INSERT INTO transaction_billing
     (bill_no, bill_type, parent_bill_id, customer_id, staff_id, subtotal, gst_total, cgst, sgst, igst, total, status, createdon)
     VALUES (?, 'return', ?, 1, ?, ?, ?, ?, ?, 0, ?, 'completed', '2026-05-29 11:00:00')`,
    {
      replacements: [
        RETURN_BILL_NO,
        saleBillId,
        staffId,
        returnTaxable,
        returnGst,
        returnCgst,
        returnSgst,
        returnTotal,
      ],
      transaction: t,
    }
  );

  await db.query(
    `INSERT INTO transactions
     (bill_id, product_id, stock_no, quantity, unit_price, gst_amount, cgst, sgst, igst, line_total, status, createdby)
     VALUES (?, ?, 'CT-002', 1, 2200, ?, ?, ?, 0, ?, 1, ?)`,
    {
      replacements: [
        returnBillId,
        cottonId,
        returnGst,
        returnCgst,
        returnSgst,
        returnTotal,
        staffId,
      ],
      transaction: t,
    }
  );

  await db.query(
    `INSERT INTO customer_credit_wallet (customer_id, balance, updatedon) VALUES
     (1, 5000, '2026-05-29 11:00:00'),
     (2, 1200, '2026-05-24 08:00:00')
     ON DUPLICATE KEY UPDATE balance = VALUES(balance), updatedon = VALUES(updatedon)`,
    { transaction: t }
  );

  await db.query(
    `INSERT INTO customer_credit_logs (customer_id, amount, type, bill_ref, notes, createdon) VALUES
     (1, 5000, 'credit', 'CT-R-2025-099', 'Return credit from prior season', '2026-05-20 10:00:00'),
     (1, ?, 'debit', ?, 'Applied on purchase', '2026-05-28 10:15:00'),
     (1, ?, 'credit', ?, 'Return credit', '2026-05-29 11:00:00'),
     (2, 1200, 'credit', '', 'Manual goodwill credit', '2026-05-24 08:00:00')`,
    {
      replacements: [creditApplied, SALE_BILL_NO, returnTotal, RETURN_BILL_NO],
      transaction: t,
    }
  );

  return { saleBillId, returnBillId, total };
}

async function verifyBill(t, billNo) {
  const [[row]] = await db.query(
    `SELECT
        tb.bill_no,
        tb.total,
        tb.gst_total,
        tb.cgst,
        tb.sgst,
        COALESCE(SUM(t.line_total), 0) AS sum_lines,
        COALESCE(SUM(t.gst_amount), 0) AS sum_gst,
        COALESCE(SUM(t.cgst), 0) AS sum_cgst,
        COALESCE(SUM(t.sgst), 0) AS sum_sgst
     FROM transaction_billing tb
     LEFT JOIN transactions t ON t.bill_id = tb.id AND t.status = 1
     WHERE tb.bill_no = ?
     GROUP BY tb.id`,
    { replacements: [billNo], transaction: t }
  );
  if (!row) return { ok: false, message: "Bill not found" };

  const checks = [
    ["total", row.total, row.sum_lines],
    ["gst_total", row.gst_total, row.sum_gst],
    ["cgst", row.cgst, row.sum_cgst],
    ["sgst", row.sgst, row.sum_sgst],
  ];

  const mismatches = checks.filter(([, h, l]) => Math.abs(Number(h) - Number(l)) > 0.02);
  return { ok: mismatches.length === 0, bill_no: billNo, mismatches };
}

async function main() {
  await connectDB();
  await setSessionDefaults();

  const t = await db.transaction();
  try {
    const [[admin]] = await db.query(`SELECT id FROM users WHERE username = 'admin' LIMIT 1`, {
      transaction: t,
    });
    const staffId = admin?.id ?? 1;

    const [[silk]] = await db.query(`SELECT id FROM products WHERE stock_no = 'CT-001' LIMIT 1`, {
      transaction: t,
    });
    const [[cotton]] = await db.query(`SELECT id FROM products WHERE stock_no = 'CT-002' LIMIT 1`, {
      transaction: t,
    });

    if (!silk || !cotton) {
      throw new Error("Products CT-001 and CT-002 must exist. Run seed-pos.js prerequisites first.");
    }

    await deleteSampleBills(t);
    const { saleBillId, returnBillId, total } = await insertSampleBills(
      t,
      staffId,
      silk.id,
      cotton.id
    );

    const saleCheck = await verifyBill(t, SALE_BILL_NO);
    const returnCheck = await verifyBill(t, RETURN_BILL_NO);

    if (!saleCheck.ok || !returnCheck.ok) {
      throw new Error(`Verification failed: ${JSON.stringify({ saleCheck, returnCheck })}`);
    }

    await t.commit();

    console.log("Sample POS bills repaired successfully.");
    console.log(`  Sale: ${SALE_BILL_NO} (id ${saleBillId}) — total ₹${total}`);
    console.log(`  Return: ${RETURN_BILL_NO} (id ${returnBillId})`);
    console.log("  Header and line items verified aligned.");
  } catch (err) {
    await t.rollback();
    throw err;
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
