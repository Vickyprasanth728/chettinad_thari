import { db } from "../config/Database.js";

async function nextCounter(column) {
  const today = new Date().toISOString().slice(0, 10);
  await db.query(
    `INSERT INTO daily_reset_counter (counter_date, ${column})
     VALUES (?, 1)
     ON DUPLICATE KEY UPDATE ${column} = ${column} + 1`,
    { replacements: [today] }
  );
  const [[row]] = await db.query(
    `SELECT ${column} AS val FROM daily_reset_counter WHERE counter_date = ?`,
    { replacements: [today] }
  );
  return row?.val || 1;
}

async function peekCounter(column) {
  const today = new Date().toISOString().slice(0, 10);
  const [[row]] = await db.query(
    `SELECT ${column} AS val FROM daily_reset_counter WHERE counter_date = ?`,
    { replacements: [today] }
  );
  return (row?.val || 0) + 1;
}

/** Next bill number without consuming the daily counter (for UI preview). */
export async function previewNextBillNumber() {
  const counter = await peekCounter("counter_value_bill");
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `BILL-${today}-${String(counter).padStart(4, "0")}`;
}

export async function generateBillNumber() {
  const counter = await nextCounter("counter_value_bill");
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `BILL-${today}-${String(counter).padStart(4, "0")}`;
}

export async function generateReturnBillNumber() {
  const counter = await nextCounter("counter_value_return");
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `RET-${today}-${String(counter).padStart(4, "0")}`;
}

export async function generateTransId() {
  const counter = await nextCounter("counter_value_trans");
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `CHET-${today}-${String(counter).padStart(4, "0")}`;
}
