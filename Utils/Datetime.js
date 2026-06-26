import { db } from "../config/Database.js";

export const getCurrentISTTime = async () => {
  const [[row]] = await db.query(
    `SELECT CONVERT_TZ(NOW(), '+00:00', '+05:30') AS ist_time`
  );
  return row?.ist_time || new Date();
};

export const getCurrentISTDate = async () => {
  const [[row]] = await db.query(
    `SELECT DATE(CONVERT_TZ(NOW(), '+00:00', '+05:30')) AS ist_date`
  );
  const d = row?.ist_date;
  if (!d) return new Date().toISOString().slice(0, 10);
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
};
