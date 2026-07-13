import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_DATABASE || "chettinad_thari",
});

const [cats] = await conn.query(
  `SELECT id, name, parent_id FROM product_categories WHERE status != 0 LIMIT 20`
);
const [gst] = await conn.query(`SELECT id, tax FROM gst WHERE status != 0`);
const [vendors] = await conn.query(
  `SELECT id, vendor_code FROM vendors WHERE status != 0 LIMIT 5`
);
const [designs] = await conn.query(
  `SELECT id, design_code FROM design_master WHERE status != 0 LIMIT 5`
);
const [[col]] = await conn.query(
  `SELECT COUNT(*) AS has_col
   FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'products'
     AND COLUMN_NAME = 'base_uom'`
);

console.log(JSON.stringify({ base_uom_column: col.has_col > 0, cats, gst, vendors, designs }, null, 2));
await conn.end();
