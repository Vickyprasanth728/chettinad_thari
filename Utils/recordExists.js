import { db } from "../config/Database.js";

/** Tables that use status = 1 for active records (others use status != 0). */
const STATUS_EQUALS_ONE_TABLES = new Set(["sidebar", "permissions", "vendor_orders"]);

/**
 * Parse and validate a numeric record id from path/query.
 * @returns {number}
 */
export function parseRecordId(id, label = "id") {
  if (id === undefined || id === null || id === "") {
    const err = new Error(`${label} is required`);
    err.statusCode = 400;
    throw err;
  }
  if (String(id).includes(",")) {
    const err = new Error(`Invalid ${label}`);
    err.statusCode = 400;
    throw err;
  }
  const num = Number(id);
  if (!Number.isInteger(num) || num <= 0) {
    const err = new Error(`Invalid ${label}`);
    err.statusCode = 400;
    throw err;
  }
  return num;
}

/**
 * Parse comma-separated numeric ids from path (e.g. "8,9" or "8").
 * @returns {number[]}
 */
export function parseRecordIds(rawId, label = "id") {
  if (rawId === undefined || rawId === null || rawId === "") {
    const err = new Error(`${label} is required`);
    err.statusCode = 400;
    throw err;
  }

  const parts = String(rawId)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) {
    const err = new Error(`${label} is required`);
    err.statusCode = 400;
    throw err;
  }

  const ids = [];
  const seen = new Set();
  for (const part of parts) {
    const num = Number(part);
    if (!Number.isInteger(num) || num <= 0) {
      const err = new Error(`Invalid ${label}: ${part}`);
      err.statusCode = 400;
      throw err;
    }
    if (!seen.has(num)) {
      seen.add(num);
      ids.push(num);
    }
  }
  return ids;
}

/** Active-row SQL filter for soft-deleted tables. */
export function activeFilterForTable(table, hasStatusField = true) {
  if (!hasStatusField) return null;
  if (STATUS_EQUALS_ONE_TABLES.has(table)) return "status = 1";
  return "status != 0";
}

/**
 * Find a single row by id. Returns null when not found.
 */
export async function findRecordById(table, id, options = {}) {
  const {
    idColumn = "id",
    activeFilter = activeFilterForTable(table),
    columns = "*",
  } = options;

  const parsedId = parseRecordId(id);
  let sql = `SELECT ${columns} FROM ${table} WHERE ${idColumn} = ?`;
  const params = [parsedId];
  if (activeFilter) {
    sql += ` AND ${activeFilter}`;
  }
  const [[row]] = await db.query(sql, { replacements: params });
  return row ?? null;
}

/**
 * Ensure a record exists before update/delete. Throws with statusCode 404 when missing.
 */
export async function assertRecordExists(table, id, options = {}) {
  const row = await findRecordById(table, id, options);
  if (!row) {
    const err = new Error(options.notFoundMessage || "Record not found");
    err.statusCode = 404;
    throw err;
  }
  return row;
}

/**
 * Ensure all ids exist before bulk delete. Throws 404 listing missing ids.
 */
export async function assertRecordsExist(table, ids, options = {}) {
  const parsedIds = Array.isArray(ids) ? ids : parseRecordIds(ids);
  if (!parsedIds.length) return [];

  const {
    idColumn = "id",
    activeFilter = activeFilterForTable(table),
    columns = "*",
  } = options;

  const placeholders = parsedIds.map(() => "?").join(", ");
  let sql = `SELECT ${columns} FROM ${table} WHERE ${idColumn} IN (${placeholders})`;
  const params = [...parsedIds];
  if (activeFilter) {
    sql += ` AND ${activeFilter}`;
  }

  const [rows] = await db.query(sql, { replacements: params });
  const foundIds = new Set(rows.map((row) => row[idColumn] ?? row.id));
  const missing = parsedIds.filter((id) => !foundIds.has(id));

  if (missing.length) {
    const baseMessage = options.notFoundMessage || "Record not found";
    const err = new Error(`${baseMessage}: ${missing.join(", ")}`);
    err.statusCode = 404;
    err.missingIds = missing;
    throw err;
  }

  return rows;
}
