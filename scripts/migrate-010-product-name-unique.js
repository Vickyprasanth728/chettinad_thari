import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const dbName = process.env.DB_DATABASE || "chettinad_thari";

async function indexExists(conn, table, indexName) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.statistics
     WHERE table_schema = ? AND table_name = ? AND index_name = ? LIMIT 1`,
    [dbName, table, indexName]
  );
  return rows.length > 0;
}

async function findDuplicateNames(conn) {
  const [rows] = await conn.query(
    `SELECT product_name AS value, COUNT(*) AS cnt
     FROM products
     WHERE product_name IS NOT NULL AND product_name != ''
     GROUP BY product_name
     HAVING cnt > 1`
  );
  return rows;
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
    console.log("Applying migration 010 — product_name unique...");

    if (await indexExists(conn, "products", "uk_product_name")) {
      console.log("  products.uk_product_name already exists — skipped");
      return;
    }

    const duplicates = await findDuplicateNames(conn);
    if (duplicates.length) {
      console.error("Cannot add uk_product_name: duplicate product_name values found:");
      for (const row of duplicates) {
        console.error(`  - "${row.value}" (${row.cnt} rows)`);
      }
      throw new Error("Resolve duplicate product names before running this migration");
    }

    await conn.query(`ALTER TABLE products ADD UNIQUE KEY uk_product_name (product_name)`);
    console.log("  products.uk_product_name added");
    console.log("Migration 010 complete.");
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
