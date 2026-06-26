import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbName = process.env.DB_DATABASE || "chettinad_thari";

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = ? AND table_name = ? AND column_name = ? LIMIT 1`,
    [dbName, table, column]
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
    await conn.query(`USE \`${dbName}\``);

    if (!(await columnExists(conn, "transactions", "returned_qty"))) {
      await conn.query(
        `ALTER TABLE transactions ADD COLUMN returned_qty INT NOT NULL DEFAULT 0 AFTER quantity`
      );
      console.log("  transactions: added returned_qty");
    }

    if (!(await columnExists(conn, "transactions", "cancelled_qty"))) {
      const afterCol = (await columnExists(conn, "transactions", "returned_qty")) ? "returned_qty" : "quantity";
      await conn.query(
        `ALTER TABLE transactions ADD COLUMN cancelled_qty INT NOT NULL DEFAULT 0 AFTER ${afterCol}`
      );
      console.log("  transactions: added cancelled_qty");
    }

    if (!(await columnExists(conn, "transactions", "parent_transaction_id"))) {
      await conn.query(
        `ALTER TABLE transactions ADD COLUMN parent_transaction_id INT NULL AFTER bill_id`
      );
      console.log("  transactions: added parent_transaction_id");
    }

    console.log(`Migration 013 completed on database "${dbName}".`);
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME") {
      console.log("Migration 013 skipped (already applied):", e.message);
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
