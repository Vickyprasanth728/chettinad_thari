import { db } from "../../../config/Database.js";
import { sendSuccess, sendError } from "../../../Utils/response.js";
import { respondDbError } from "../../../Utils/dbError.js";
import { hasCrudId, sqlReplacements } from "../../../Utils/crudQuery.js";
import { parseListQuery, buildLikeSearch, listResult } from "../../../Utils/listQuery.js";
import { getRecordIds, deleteSuccessMessage, deleteSuccessPayload, softDeleteByIds } from "../../../Utils/bulkDelete.js";

export const getPermissions = async (req, res) => {
  try {
    if (hasCrudId(req)) {
      const [[row]] = await db.query(`SELECT * FROM permissions WHERE id = ? AND status = 1`, {
        replacements: [req.query.id],
      });
      if (!row) return sendError(res, "Permission not found", 404);
      return sendSuccess(res, "Permission fetched", row);
    }

    const { page, limit, offset, search } = parseListQuery(req.query);
    let where = "WHERE status = 1";
    const params = [];
    const searchPart = buildLikeSearch(["name"], search);
    where += searchPart.clause;
    params.push(...searchPart.params);

    const [rows] = await db.query(
      `SELECT * FROM permissions ${where} ORDER BY name ASC LIMIT ? OFFSET ?`,
      { replacements: [...params, limit, offset] }
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM permissions ${where}`,
      { replacements: params }
    );

    return sendSuccess(res, "Permissions fetched", listResult(rows, { page, limit, total }));
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const addPermission = async (req, res) => {
  const { name } = req.body;
  const [r] = await db.query(`INSERT INTO permissions (name) VALUES (?)`, { replacements: [name] });
  return sendSuccess(res, "Permission created", { id: r });
};

export const updatePermission = async (req, res) => {
  try {
    const { name, status } = req.body;
    await db.query(`UPDATE permissions SET name = COALESCE(?, name), status = COALESCE(?, status) WHERE id = ?`, {
      replacements: sqlReplacements(name, status, req.params.id),
    });
    return sendSuccess(res, "Permission updated");
  } catch (error) {
    return respondDbError(res, error, "Failed to update permission");
  }
};

export const deletePermission = async (req, res) => {
  try {
    const ids = getRecordIds(req);
    await softDeleteByIds("permissions", ids);
    return sendSuccess(res, deleteSuccessMessage(ids.length), deleteSuccessPayload(ids));
  } catch (error) {
    return respondDbError(res, error, "Failed to delete permission");
  }
};
