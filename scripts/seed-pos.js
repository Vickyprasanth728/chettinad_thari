/**

 * Seed POS sample data (CT-S-2026-001 sale + CT-R-2026-001 return).

 * Header and line-item amounts are aligned for GST reporting.

 * Usage: node scripts/seed-pos.js

 * Safe to re-run — skips when sample bill_no already exists.

 */

import dotenv from "dotenv";

import { db, connectDB, setSessionDefaults } from "../config/Database.js";



dotenv.config();



const SAMPLE_BILL_NO = "CT-S-2026-001";

const RETURN_BILL_NO = "CT-R-2026-001";



async function upsertCustomer({ id, name, email, mobile }) {

  const [[existing]] = await db.query(`SELECT id FROM billing_customers WHERE id = ?`, {

    replacements: [id],

  });

  if (existing) {

    await db.query(

      `UPDATE billing_customers SET name = ?, email = ?, mobile = ? WHERE id = ?`,

      { replacements: [name, email, mobile, id] }

    );

    return id;

  }

  await db.query(

    `INSERT INTO billing_customers (id, name, email, mobile) VALUES (?, ?, ?, ?)`,

    { replacements: [id, name, email, mobile] }

  );

  return id;

}



async function upsertProduct({
  stock_no,
  product_name,
  quantity,
  retail_price,
  hsn_code = "5208",
  gst_id = 1,
}) {

  const [[existing]] = await db.query(`SELECT id FROM products WHERE stock_no = ?`, {

    replacements: [stock_no],

  });

  if (existing) {

    await db.query(

      `UPDATE products SET product_name = ?, quantity = ?, retail_price = ?,
              hsn_code = COALESCE(hsn_code, ?), gst_id = COALESCE(gst_id, ?) WHERE id = ?`,

      { replacements: [product_name, quantity, retail_price, hsn_code, gst_id, existing.id] }

    );

    return existing.id;

  }

  const [productId] = await db.query(

    `INSERT INTO products (stock_no, product_name, quantity, retail_price, hsn_code, gst_id, published, status)

     VALUES (?, ?, ?, ?, ?, ?, 1, 1)`,

    { replacements: [stock_no, product_name, quantity, retail_price, hsn_code, gst_id] }

  );

  return productId;

}



async function seed() {

  await connectDB();

  await setSessionDefaults();



  const [[existingBill]] = await db.query(

    `SELECT id FROM transaction_billing WHERE bill_no = ?`,

    { replacements: [SAMPLE_BILL_NO] }

  );

  if (existingBill) {

    console.log(`Sample POS bill ${SAMPLE_BILL_NO} already exists — skipping seed.`);

    console.log("To fix mismatched data run: node scripts/repair-pos-sample-bill.js");

    process.exit(0);

  }



  const [[admin]] = await db.query(`SELECT id FROM users WHERE username = 'admin' LIMIT 1`);

  const staffId = admin?.id ?? 1;



  await upsertCustomer({

    id: 1,

    name: "Lakshmi Devi",

    email: "lakshmi@example.com",

    mobile: "9876543210",

  });

  await upsertCustomer({

    id: 2,

    name: "Rajan Kumar",

    email: "rajan@example.com",

    mobile: "9876501234",

  });



  const silkId = await upsertProduct({

    stock_no: "CT-001",

    product_name: "Kanchipuram Silk Saree",

    quantity: 20,

    retail_price: 8500,

  });

  const cottonId = await upsertProduct({

    stock_no: "CT-002",

    product_name: "Chettinad Cotton Saree",

    quantity: 30,

    retail_price: 2200,

  });



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

      replacements: [SAMPLE_BILL_NO, staffId, subtotal, gstTotal, cgst, sgst, total, creditApplied],

    }

  );



  await db.query(

    `INSERT INTO transactions

     (bill_id, product_id, stock_no, quantity, unit_price, gst_amount, cgst, sgst, igst, line_total, status, createdby)

     VALUES

     (?, ?, 'CT-001', 1, 8500, 425, 212.5, 212.5, 0, 8925, 1, ?),

     (?, ?, 'CT-002', 2, 2200, 220, 110, 110, 0, 4620, 1, ?)`,

    { replacements: [saleBillId, silkId, staffId, saleBillId, cottonId, staffId] }

  );



  await db.query(

    `INSERT INTO split_payments (bill_id, payment_method, amount) VALUES

     (?, 'cash', 8000),

     (?, 'upi', 3545)`,

    { replacements: [saleBillId, saleBillId] }

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

    }

  );



  await db.query(

    `INSERT INTO transactions

     (bill_id, product_id, stock_no, quantity, unit_price, gst_amount, cgst, sgst, igst, line_total, status, createdby)

     VALUES (?, ?, 'CT-002', 1, 2200, ?, ?, ?, 0, ?, 1, ?)`,

    {

      replacements: [returnBillId, cottonId, returnGst, returnCgst, returnSgst, returnTotal, staffId],

    }

  );



  await db.query(

    `INSERT INTO customer_credit_wallet (customer_id, balance, updatedon) VALUES

     (1, 5000, '2026-05-29 11:00:00'),

     (2, 1200, '2026-05-24 08:00:00')

     ON DUPLICATE KEY UPDATE balance = VALUES(balance), updatedon = VALUES(updatedon)`

  );



  await db.query(`DELETE FROM customer_credit_logs WHERE customer_id IN (1, 2)`);

  await db.query(

    `INSERT INTO customer_credit_logs (customer_id, amount, type, bill_ref, notes, createdon) VALUES

     (1, 5000, 'credit', 'CT-R-2025-099', 'Return credit from prior season', '2026-05-20 10:00:00'),

     (1, ?, 'debit', ?, 'Applied on purchase', '2026-05-28 10:15:00'),

     (1, ?, 'credit', ?, 'Return credit', '2026-05-29 11:00:00'),

     (2, 1200, 'credit', '', 'Manual goodwill credit', '2026-05-24 08:00:00')`,

    { replacements: [creditApplied, SAMPLE_BILL_NO, returnTotal, RETURN_BILL_NO] }

  );



  console.log("POS sample data seeded:");

  console.log(`  Sale bill: ${SAMPLE_BILL_NO} (id ${saleBillId}) — total ₹${total}`);

  console.log(`  Return bill: ${RETURN_BILL_NO} (id ${returnBillId})`);

  console.log("  Credit wallets: customer 1 = ₹5000, customer 2 = ₹1200");

  process.exit(0);

}



seed().catch((err) => {

  console.error(err);

  process.exit(1);

});


