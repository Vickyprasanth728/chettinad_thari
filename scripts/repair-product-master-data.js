/**
 * Backfills HSN codes and default GST slab on products missing master tax data.
 * Usage: node scripts/repair-product-master-data.js
 */
import dotenv from "dotenv";
import { db, connectDB, setSessionDefaults } from "../config/Database.js";

dotenv.config();

const PRODUCT_UPDATES = [
  { stock_no: "CT-001", hsn_code: "5208", gst_id: 1 },
  { stock_no: "CT-002", hsn_code: "5208", gst_id: 1 },
  { stock_no: "PK003918", hsn_code: "5208", gst_id: 1 },
  { stock_no: "STK002", hsn_code: "5208", gst_id: 1 },
  { stock_no: "TST-1780238524948", hsn_code: "5208", gst_id: 1 },
];

async function main() {
  await connectDB();
  await setSessionDefaults();

  const [[defaultGst]] = await db.query(
    `SELECT id FROM gst WHERE status = 1 ORDER BY tax ASC LIMIT 1`
  );
  const defaultGstId = defaultGst?.id ?? 1;

  for (const item of PRODUCT_UPDATES) {
    await db.query(
      `UPDATE products
       SET hsn_code = ?, gst_id = COALESCE(gst_id, ?)
       WHERE stock_no = ?`,
      { replacements: [item.hsn_code, item.gst_id ?? defaultGstId, item.stock_no] }
    );
  }

  await db.query(
    `UPDATE products SET hsn_code = '5208', gst_id = COALESCE(gst_id, ?)
     WHERE status = 1 AND (hsn_code IS NULL OR hsn_code = '')`,
    { replacements: [defaultGstId] }
  );

  const [rows] = await db.query(
    `SELECT stock_no, product_name, hsn_code, gst_id FROM products WHERE status = 1 ORDER BY id`
  );

  console.log("Product master data repaired:");
  for (const r of rows) {
    console.log(`  ${r.stock_no}: HSN ${r.hsn_code ?? "—"}, GST id ${r.gst_id ?? "—"}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
