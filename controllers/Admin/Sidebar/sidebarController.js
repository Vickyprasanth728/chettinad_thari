import { db } from "../../../config/Database.js";
import { sendSuccess, sendError } from "../../../Utils/response.js";
import { respondDbError } from "../../../Utils/dbError.js";
import { hasCrudId } from "../../../Utils/crudQuery.js";
import { parseListQuery, buildLikeSearch, listResult } from "../../../Utils/listQuery.js";
import { getRecordIds, deleteSuccessMessage, deleteSuccessPayload, softDeleteByIds } from "../../../Utils/bulkDelete.js";

const SIDEBAR_UNIQUE_CHECKS = [
  { field: "name", label: "Sidebar name" },
  { field: "icon", label: "Sidebar icon" },
  { field: "path", label: "Sidebar path" },
];

async function assertSidebarUniques(values, excludeId = null) {
  for (const { field, label } of SIDEBAR_UNIQUE_CHECKS) {
    const raw = values[field];
    if (raw == null || raw === "" || !String(raw).trim()) continue;

    const value = String(raw).trim();
    let sql = `SELECT id FROM sidebar WHERE ${field} = ? AND status = 1`;
    const params = [value];
    if (excludeId != null && excludeId !== "") {
      sql += ` AND id != ?`;
      params.push(excludeId);
    }

    const [rows] = await db.query(sql, { replacements: params });
    if (rows.length) {
      const err = new Error(`${label} already exists`);
      err.statusCode = 409;
      throw err;
    }
  }
}

export const getSidebar = async (req, res) => {
  try {
    if (hasCrudId(req)) {
      const [[row]] = await db.query(`SELECT * FROM sidebar WHERE id = ? AND status = 1`, {
        replacements: [req.query.id],
      });
      if (!row) return sendError(res, "Sidebar item not found", 404);
      return sendSuccess(res, "Sidebar item fetched", row);
    }

    const { page, limit, offset, search } = parseListQuery(req.query);
    let where = "WHERE status = 1";
    const params = [];
    const searchPart = buildLikeSearch(["name", "path", "icon"], search);
    where += searchPart.clause;
    params.push(...searchPart.params);

    const [rows] = await db.query(
      `SELECT * FROM sidebar ${where} ORDER BY id ASC LIMIT ? OFFSET ?`,
      { replacements: [...params, limit, offset] }
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM sidebar ${where}`,
      { replacements: params }
    );

    return sendSuccess(res, "Sidebar fetched", listResult(rows, { page, limit, total }));
  } catch (error) {
    return respondDbError(res, error, "Failed to fetch sidebar");
  }
};

export const addSidebar = async (req, res) => {
  try {
    const { name, icon, path, permission, parent_permission, status = 1 } = req.body;
    if (!name?.trim() || !icon?.trim() || !path?.trim() || permission == null || permission === "") {
      return sendError(res, "name, icon, path and permission are required");
    }

    const trimmedName = name.trim();
    const trimmedIcon = icon.trim();
    const trimmedPath = path.trim();

    await assertSidebarUniques(
      { name: trimmedName, icon: trimmedIcon, path: trimmedPath }
    );

    const [r] = await db.query(
      `INSERT INTO sidebar (name, icon, path, permission, parent_permission, status) VALUES (?, ?, ?, ?, ?, ?)`,
      {
        replacements: [
          trimmedName,
          trimmedIcon,
          trimmedPath,
          Number(permission),
          parent_permission != null && parent_permission !== "" ? Number(parent_permission) : null,
          status ?? 1,
        ],
      }
    );
    return sendSuccess(res, "Sidebar item created", { id: r });
  } catch (error) {
    return respondDbError(res, error, "Failed to create sidebar item");
  }
};

export const updateSidebar = async (req, res) => {
  try {
    const { name, icon, path, permission, parent_permission, status } = req.body;
    const id = req.params.id;

    await assertSidebarUniques({ name, icon, path }, id);

    await db.query(
      `UPDATE sidebar SET name=COALESCE(?,name), icon=COALESCE(?,icon), path=COALESCE(?,path),
       permission=COALESCE(?,permission), parent_permission=?, status=COALESCE(?,status)
       WHERE id = ?`,
      {
        replacements: [
          name?.trim() ?? null,
          icon?.trim() ?? null,
          path?.trim() ?? null,
          permission != null && permission !== "" ? Number(permission) : null,
          parent_permission != null && parent_permission !== "" ? Number(parent_permission) : null,
          status ?? null,
          id,
        ],
      }
    );
    return sendSuccess(res, "Sidebar updated");
  } catch (error) {
    return respondDbError(res, error, "Failed to update sidebar item");
  }
};

export const deleteSidebar = async (req, res) => {
  try {
    const ids = getRecordIds(req);
    await softDeleteByIds("sidebar", ids);
    return sendSuccess(res, deleteSuccessMessage(ids.length), deleteSuccessPayload(ids));
  } catch (error) {
    return respondDbError(res, error, "Failed to delete sidebar item");
  }
};
