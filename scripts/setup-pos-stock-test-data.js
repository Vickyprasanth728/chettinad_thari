/**
 * Applies migration 004 if needed and sets products 1/2 for POS stock tests.
 * Usage: node scripts/setup-pos-stock-test-data.js
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_DATABASE || "chettinad_thari",
  });

  const sql = fs.readFileSync(
    path.join(__dirname, "../migrations/004_low_stock_threshold.sql"),
    "utf8"
  );
  try {
    await conn.query(sql);
    console.log("Migration 004 applied");
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME") console.log("Migration 004 already applied");
    else throw e;
  }

  await conn.query(
    "UPDATE products SET quantity = 0, status = 1 WHERE id = 2"
  );
  await conn.query(
    "UPDATE products SET quantity = 3, low_stock_threshold = 5, status = 1 WHERE id = 1"
  );

  const [rows] = await conn.query(
    "SELECT id, stock_no, product_name, quantity, low_stock_threshold FROM products WHERE id IN (1, 2)"
  );
  console.log("Test products:", rows);
  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
