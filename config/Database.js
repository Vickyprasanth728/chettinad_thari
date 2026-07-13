import mysql from "mysql2/promise";
import { Sequelize } from "sequelize";
import "./env.js";

let pool;

async function columnExists(table, column) {
  const dbName = process.env.DB_DATABASE;
  const [[row]] = await db.query(
    `SELECT 1 AS ok FROM information_schema.columns
     WHERE table_schema = ? AND table_name = ? AND column_name = ? LIMIT 1`,
    { replacements: [dbName, table, column] }
  );
  return Boolean(row?.ok);
}

const ensureTransactionTrackingColumns = async () => {
  const [[tableRow]] = await db.query(
    `SELECT 1 AS ok FROM information_schema.tables
     WHERE table_schema = ? AND table_name = 'transactions' LIMIT 1`,
    { replacements: [process.env.DB_DATABASE] }
  );
  if (!tableRow?.ok) return;

  if (!(await columnExists("transactions", "returned_qty"))) {
    await db.query(
      `ALTER TABLE transactions ADD COLUMN returned_qty INT NOT NULL DEFAULT 0 AFTER quantity`
    );
    console.log("transactions: added returned_qty");
  }
  if (!(await columnExists("transactions", "cancelled_qty"))) {
    const afterCol = (await columnExists("transactions", "returned_qty")) ? "returned_qty" : "quantity";
    await db.query(
      `ALTER TABLE transactions ADD COLUMN cancelled_qty INT NOT NULL DEFAULT 0 AFTER ${afterCol}`
    );
    console.log("transactions: added cancelled_qty");
  }
  if (!(await columnExists("transactions", "parent_transaction_id"))) {
    await db.query(
      `ALTER TABLE transactions ADD COLUMN parent_transaction_id INT NULL AFTER bill_id`
    );
    console.log("transactions: added parent_transaction_id");
  }
};

const ensureMasterTables = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS size_master (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150) NOT NULL UNIQUE,
      status TINYINT DEFAULT 1,
      createdon DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedon DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS color_master (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150) NOT NULL UNIQUE,
      status TINYINT DEFAULT 1,
      createdon DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedon DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
};

export const connectDB = async () => {
  try {
    if (!pool) {
      pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
      });
      await db.authenticate();
      await ensureMasterTables();
      await ensureTransactionTrackingColumns();
      console.log(`Connected to database: ${process.env.DB_DATABASE}`);
    }
    return pool;
  } catch (error) {
    console.error("Unable to connect to the database:", error);
    throw error;
  }
};

export const getConnection = async () => {
  if (!pool) await connectDB();
  return pool;
};

export const db = new Sequelize(
  process.env.DB_DATABASE,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: "mysql",
    logging: false,
  }
);

export const performQuery = async (query, params = [], isDataRequest = false) => {
  await db.authenticate();
  if (isDataRequest) {
    return db.query(query, { replacements: params, type: db.QueryTypes.SELECT });
  }
  const [result] = await db.query(query, { replacements: params });
  return result;
};

export const setSessionDefaults = async () => {
  await db.query("SET time_zone = '+05:30'");
  await db.query("SET sql_mode = (SELECT REPLACE(@@sql_mode, 'ONLY_FULL_GROUP_BY', ''))");
};
