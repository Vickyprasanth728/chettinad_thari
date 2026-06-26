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

    if (await columnExists(conn, "print_receipt_template", "createdby")) {
      console.log("  print_receipt_template audit columns already exist — skipped");
      return;
    }

    const sqlPath = path.join(__dirname, "../migrations/008_print_receipt_template_audit.sql");
    await conn.query(fs.readFileSync(sqlPath, "utf8"));
    console.log("  print_receipt_template: added createdby, createdon, updatedby, updatedon");
    console.log(`Migration 008 completed on database "${dbName}".`);
  } catch (e) {
    if (
      e.code === "ER_DUP_FIELDNAME" ||
      e.code === "ER_DUP_KEYNAME" ||
      e.code === "ER_CANT_CREATE_TABLE" ||
      e.code === "ER_FK_DUP_NAME"
    ) {
      console.log("Migration 008 skipped (already applied):", e.message);
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
