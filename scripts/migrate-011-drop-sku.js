import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const dbName = process.env.DB_DATABASE || "chettinad_thari";

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = ? AND table_name = ? AND column_name = ? LIMIT 1`,
    [dbName, table, column]
  );
  return rows.length > 0;
}

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: dbName,
    multipleStatements: true,
  });

  try {
    console.log("Applying migration 011 — drop sku columns...");

    if (await columnExists(conn, "transactions", "sku")) {
      await conn.query(`ALTER TABLE transactions DROP COLUMN sku`);
      console.log("  transactions.sku dropped");
    } else {
      console.log("  transactions.sku already absent — skipped");
    }

    if (await columnExists(conn, "products", "sku")) {
      await conn.query(`ALTER TABLE products DROP COLUMN sku`);
      console.log("  products.sku dropped");
    } else {
      console.log("  products.sku already absent — skipped");
    }

    console.log("Migration 011 complete.");
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
