import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import {
  DEFAULT_RECEIPT_HTML,
  RECEIPT_TEMPLATE_NAME,
} from "../Utils/receiptTemplateDefaults.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbName = process.env.DB_DATABASE || "chettinad_thari";

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = ? AND table_name = ? LIMIT 1`,
    [dbName, table]
  );
  return rows.length > 0;
}

async function migrate() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    multipleStatements: true,
  });

  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await conn.query(`USE \`${dbName}\``);

    const sqlPath = path.join(__dirname, "../migrations/007_print_receipt_template.sql");
    await conn.query(fs.readFileSync(sqlPath, "utf8"));
    console.log("  print_receipt_template table ready");

    if (await tableExists(conn, "print_receipt_template")) {
      const [[existing]] = await conn.query(
        `SELECT id FROM print_receipt_template WHERE name = ? LIMIT 1`,
        [RECEIPT_TEMPLATE_NAME]
      );
      if (!existing) {
        await conn.query(
          `INSERT INTO print_receipt_template (name, value) VALUES (?, ?)`,
          [RECEIPT_TEMPLATE_NAME, DEFAULT_RECEIPT_HTML]
        );
        console.log(`  Seeded default template "${RECEIPT_TEMPLATE_NAME}"`);
      } else {
        console.log(`  Default template "${RECEIPT_TEMPLATE_NAME}" already exists — skipped seed`);
      }
    }

    console.log(`Migration 007 completed on database "${dbName}".`);
  } finally {
    await conn.end();
  }
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
