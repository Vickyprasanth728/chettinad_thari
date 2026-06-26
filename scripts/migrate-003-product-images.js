import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const sqlPath = path.join(__dirname, "../migrations/003_product_images.sql");
  let sql = fs.readFileSync(sqlPath, "utf8");
  sql = sql.replace(/USE chettinad_thari;\s*/i, "");

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_DATABASE || "chettinad_thari",
    multipleStatements: true,
  });

  await conn.query(sql);
  await conn.end();
  console.log("Migration 003 (product_images) completed.");
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
