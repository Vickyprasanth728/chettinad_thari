import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const sqlPath = path.join(__dirname, "../migrations/017_product_base_uom_text.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_DATABASE || "chettinad_thari",
    multipleStatements: true,
  });

  const [[col]] = await conn.query(
    `SELECT COUNT(*) AS has_col
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'products'
       AND COLUMN_NAME = 'base_uom'`
  );
  if (col.has_col > 0) {
    console.log("Migration 017 skipped — products.base_uom already exists.");
    await conn.end();
    return;
  }

  await conn.query(sql);
  await conn.end();
  console.log("Migration 017 (products.base_uom text) completed.");
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
