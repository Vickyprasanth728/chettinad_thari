import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const dbName = process.env.DB_DATABASE || "chettinad_thari";

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = ? AND table_name = ? LIMIT 1`,
    [dbName, table]
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
    if (await tableExists(conn, "password_reset_tokens")) {
      console.log("password_reset_tokens already exists — skipped");
      return;
    }

    await conn.query(`
      CREATE TABLE password_reset_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token_hash CHAR(64) NOT NULL,
        expires_at DATETIME NOT NULL,
        used_at DATETIME NULL,
        createdon DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_reset_token_hash (token_hash),
        KEY idx_reset_user (user_id),
        KEY idx_reset_expires (expires_at),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log("Migration 012 complete — password_reset_tokens created.");
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
