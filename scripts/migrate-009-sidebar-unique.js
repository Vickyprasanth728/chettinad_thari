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

async function findDuplicates(conn, column) {
  const [rows] = await conn.query(
    `SELECT \`${column}\` AS value, COUNT(*) AS cnt
     FROM sidebar
     WHERE \`${column}\` IS NOT NULL AND \`${column}\` != ''
     GROUP BY \`${column}\`
     HAVING cnt > 1`
  );
  return rows;
}

async function ensureUniqueIndex(conn, column, indexName) {
  if (await indexExists(conn, "sidebar", indexName)) {
    console.log(`  sidebar.${indexName} already exists — skipped`);
    return;
  }

  const duplicates = await findDuplicates(conn, column);
  if (duplicates.length) {
    console.error(`Cannot add ${indexName}: duplicate ${column} values found:`);
    for (const row of duplicates) {
      console.error(`  - "${row.value}" (${row.cnt} rows)`);
    }
    throw new Error(`Resolve duplicate sidebar ${column} values before running this migration`);
  }

  await conn.query(`ALTER TABLE sidebar ADD UNIQUE KEY \`${indexName}\` (\`${column}\`)`);
  console.log(`  sidebar.${indexName} added`);
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
    console.log("Applying migration 009 — sidebar name & icon unique...");
    await ensureUniqueIndex(conn, "name", "uk_sidebar_name");
    await ensureUniqueIndex(conn, "icon", "uk_sidebar_icon");
    console.log("Migration 009 complete.");
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
