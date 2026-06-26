/**
 * Align legacy product_images columns (image, imageseq) with API (file_name, image_seq).
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

async function hasColumn(conn, dbName, table, column) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [dbName, table, column]
  );
  return rows.length > 0;
}

async function migrate() {
  const dbName = process.env.DB_DATABASE || "chettinad_thari";
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: dbName,
  });

  const table = "product_images";
  const exists = await hasColumn(conn, dbName, table, "id");
  if (!exists) {
    console.log("Table product_images not found — run migrate:product-images first.");
    await conn.end();
    return;
  }

  const hasImage = await hasColumn(conn, dbName, table, "image");
  const hasFileName = await hasColumn(conn, dbName, table, "file_name");
  const hasImageSeq = await hasColumn(conn, dbName, table, "imageseq");
  const hasImageSeqNew = await hasColumn(conn, dbName, table, "image_seq");
  const hasIsPrimary = await hasColumn(conn, dbName, table, "is_primary");

  if (hasImage && !hasFileName) {
    await conn.query(
      "ALTER TABLE product_images CHANGE COLUMN image file_name VARCHAR(255) NOT NULL"
    );
    console.log("Renamed product_images.image → file_name");
  }

  if (hasImageSeq && !hasImageSeqNew) {
    await conn.query(
      "ALTER TABLE product_images CHANGE COLUMN imageseq image_seq INT NOT NULL DEFAULT 1"
    );
    console.log("Renamed product_images.imageseq → image_seq");
  }

  if (!(await hasColumn(conn, dbName, table, "is_primary"))) {
    await conn.query(
      "ALTER TABLE product_images ADD COLUMN is_primary TINYINT NOT NULL DEFAULT 1 AFTER image_seq"
    );
    console.log("Added product_images.is_primary");
  } else if (!hasIsPrimary) {
    // already added in block above
  }

  await conn.end();
  console.log("Migration 004 (product_images columns) completed.");
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
