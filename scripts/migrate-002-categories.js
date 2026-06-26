import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const sqlPath = path.join(__dirname, "../migrations/002_product_categories.sql");
  let sql = fs.readFileSync(sqlPath, "utf8");

  // MySQL 8.0.12+ supports IF NOT EXISTS on ADD COLUMN; fallback for older versions
  if (!process.env.MYSQL8_ADD_COLUMN_IF_NOT_EXISTS) {
    sql = sql.replace(
      "ADD COLUMN IF NOT EXISTS category_id INT NULL,\n  ADD CONSTRAINT fk_products_category",
      "ADD COLUMN category_id INT NULL,\n  ADD CONSTRAINT fk_products_category"
    );
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_DATABASE || "chettinad_thari",
    multipleStatements: true,
  });

  try {
    await conn.query(sql);
    console.log("Migration 002 (product_categories) completed.");
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME" || e.code === "ER_TABLE_EXISTS_ERR" || e.code === "ER_DUP_KEYNAME") {
      console.log("Migration 002 skipped (already applied):", e.message);
    } else {
      throw e;
    }
  } finally {
    await conn.end();
  }
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
