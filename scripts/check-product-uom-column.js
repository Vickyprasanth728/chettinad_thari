import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_DATABASE || "chettinad_thari",
});

const [cols] = await conn.query(
  `SELECT COLUMN_NAME, DATA_TYPE
   FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'products'
     AND COLUMN_NAME IN ('base_uom', 'base_uom_id')`
);

console.log(JSON.stringify({ uom_columns: cols }, null, 2));
await conn.end();
