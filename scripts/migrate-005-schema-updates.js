import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

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

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = ? AND table_name = ? AND column_name = ? LIMIT 1`,
    [dbName, table, column]
  );
  return rows.length > 0;
}

async function primaryKeyColumn(conn, table) {
  const [rows] = await conn.query(`SHOW KEYS FROM \`${table}\` WHERE Key_name = 'PRIMARY'`);
  return rows[0]?.Column_name || null;
}

async function ensureDatabase(conn) {
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await conn.query(`USE \`${dbName}\``);
}

async function ensureBaseSchema(conn) {
  if (await tableExists(conn, "transactions")) return;

  console.log("Base schema not found — running migrations/001_schema.sql first...");
  let sql = fs.readFileSync(path.join(__dirname, "../migrations/001_schema.sql"), "utf8");
  sql = sql
    .replace(/CREATE DATABASE IF NOT EXISTS chettinad_thari[^;]+;/i, "")
    .replace(/USE chettinad_thari;/i, `USE \`${dbName}\`;`);
  await conn.query(sql);
  console.log("Base schema (001) applied.");
}

async function apply005(conn) {
  await conn.query(`USE \`${dbName}\``);

  const pkCounter = await primaryKeyColumn(conn, "daily_reset_counter");
  if (pkCounter === "counter_date") {
    await conn.query("ALTER TABLE daily_reset_counter DROP PRIMARY KEY");
    await conn.query(
      `ALTER TABLE daily_reset_counter
       ADD COLUMN id INT AUTO_INCREMENT PRIMARY KEY FIRST,
       ADD UNIQUE KEY uk_counter_date (counter_date)`
    );
    console.log("  daily_reset_counter: added auto id");
  }

  const pkWallet = await primaryKeyColumn(conn, "customer_credit_wallet");
  if (pkWallet === "customer_id") {
    const [walletFks] = await conn.query(
      `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'customer_credit_wallet' AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
      [dbName]
    );
    for (const { CONSTRAINT_NAME } of walletFks) {
      await conn.query(`ALTER TABLE customer_credit_wallet DROP FOREIGN KEY \`${CONSTRAINT_NAME}\``);
    }
    await conn.query("ALTER TABLE customer_credit_wallet DROP PRIMARY KEY");
    await conn.query(
      `ALTER TABLE customer_credit_wallet
       ADD COLUMN id INT AUTO_INCREMENT PRIMARY KEY FIRST,
       ADD UNIQUE KEY uk_credit_wallet_customer (customer_id),
       ADD CONSTRAINT fk_customer_credit_wallet_customer
         FOREIGN KEY (customer_id) REFERENCES billing_customers(id)`
    );
    console.log("  customer_credit_wallet: added auto id");
  }

  if (!(await columnExists(conn, "transactions", "createdon"))) {
    await conn.query(
      `ALTER TABLE transactions
       ADD COLUMN status TINYINT NOT NULL DEFAULT 1 AFTER line_total,
       ADD COLUMN createdby INT NULL AFTER status,
       ADD COLUMN createdon DATETIME DEFAULT CURRENT_TIMESTAMP AFTER createdby,
       ADD CONSTRAINT fk_transactions_createdby FOREIGN KEY (createdby) REFERENCES users(id)`
    );
    console.log("  transactions: added status, createdby, createdon");
  }
}

async function migrate() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    multipleStatements: true,
  });

  try {
    await ensureDatabase(conn);
    await ensureBaseSchema(conn);
    await apply005(conn);
    console.log(`Migration 005 completed on database "${dbName}".`);
  } catch (e) {
    if (
      e.code === "ER_DUP_FIELDNAME" ||
      e.code === "ER_DUP_KEYNAME" ||
      e.code === "ER_CANT_DROP_FIELD_OR_KEY" ||
      e.code === "ER_MULTIPLE_PRI_KEY"
    ) {
      console.log("Migration 005 skipped (already applied):", e.message);
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
