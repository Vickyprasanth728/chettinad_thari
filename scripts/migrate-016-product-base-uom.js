import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const sqlPath = path.join(__dirname, "../migrations/016_product_base_uom.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_DATABASE || "chettinad_thari",
    multipleStatements: true,
  });

  await conn.query(sql);
  await conn.end();
  console.log("Migration 016 (products.base_uom_id) completed.");
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
