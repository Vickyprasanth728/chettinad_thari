import { assertRecordExists, assertRecordsExist, parseRecordId, parseRecordIds } from "../Utils/recordExists.js";
import { sendError } from "../Utils/response.js";

/**
 * Middleware factory — validates :id exists in the given table before update/delete.
 * DELETE accepts comma-separated ids (e.g. /8,9).
 *
 * @param {{ table: string, activeFilter?: string|null, notFoundMessage?: string, param?: string }} options
 */
export function requireRecordExists(options) {
  const {
    table,
    activeFilter,
    notFoundMessage = "Record not found",
    param = "id",
  } = options;

  return async (req, res, next) => {
    try {
      const rawId = req.params[param];
      const existsOptions = {
        activeFilter: activeFilter !== undefined ? activeFilter : undefined,
        notFoundMessage,
      };

      if (req.method === "DELETE") {
        const ids = parseRecordIds(rawId, param);
        const rows = await assertRecordsExist(table, ids, existsOptions);
        req.recordIds = ids;
        req.recordId = ids[0];
        req.existingRecords = rows;
        req.existingRecord = rows[0];
      } else {
        const id = parseRecordId(rawId, param);
        const row = await assertRecordExists(table, rawId, existsOptions);
        req.existingRecord = row;
        req.recordId = id;
      }

      next();
    } catch (error) {
      return sendError(res, error.message, error.statusCode || 500);
    }
  };
}
