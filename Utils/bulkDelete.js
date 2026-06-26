import { db } from "../config/Database.js";

/** Resolve validated id list from delete middleware or path param. */
export function getRecordIds(req) {
  if (req.recordIds?.length) return req.recordIds;
  if (req.recordId) return [req.recordId];
  return [];
}

export function deleteSuccessPayload(ids) {
  return {
    deleted_ids: ids,
    count: ids.length,
  };
}

export function deleteSuccessMessage(count) {
  return count === 1 ? "Record deleted" : "Records deleted";
}

/**
 * Soft-delete rows by setting status = 0.
 * @param {string} table
 * @param {number[]} ids
 * @param {{ idColumn?: string, setClause?: string, setParams?: unknown[] }} [options]
 */
export async function softDeleteByIds(table, ids, options = {}) {
  const { idColumn = "id", setClause = "status = 0", setParams = [] } = options;
  if (!ids.length) return ids;

  const placeholders = ids.map(() => "?").join(", ");
  await db.query(`UPDATE ${table} SET ${setClause} WHERE ${idColumn} IN (${placeholders})`, {
    replacements: [...setParams, ...ids],
  });
  return ids;
}

/**
 * Hard-delete rows by primary key.
 */
export async function hardDeleteByIds(table, ids, options = {}) {
  const { idColumn = "id" } = options;
  if (!ids.length) return ids;

  const placeholders = ids.map(() => "?").join(", ");
  await db.query(`DELETE FROM ${table} WHERE ${idColumn} IN (${placeholders})`, {
    replacements: ids,
  });
  return ids;
}
