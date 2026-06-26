import { db, setSessionDefaults } from "../../../config/Database.js";
import { sendSuccess, sendError } from "../../../Utils/response.js";
import { hasCrudId } from "../../../Utils/crudQuery.js";
import { parseListQuery, buildLikeSearch, listResult } from "../../../Utils/listQuery.js";
import { getRecordIds, deleteSuccessMessage, deleteSuccessPayload, softDeleteByIds } from "../../../Utils/bulkDelete.js";

export const AddRole = async (req, res) => {
  try {
    await setSessionDefaults();
    const { name, permissions = [], status = 1 } = req.body;
    if (!name) return sendError(res, "Role name required");

    const [result] = await db.query(`INSERT INTO roles (name, status) VALUES (?, ?)`, {
      replacements: [name, status],
    });
    const roleId = result;

    for (const permId of permissions) {
      await db.query(`INSERT INTO rolepermission (role_id, permission_id) VALUES (?, ?)`, {
        replacements: [roleId, permId],
      });
    }
    return sendSuccess(res, "Role created", { id: roleId });
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

async function attachRolePermissions(role) {
  const [perms] = await db.query(
    `SELECT p.id, p.name FROM rolepermission rp
     JOIN permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = ?`,
    { replacements: [role.id] }
  );
  role.permissions = perms;
  return role;
}

export const GetRoles = async (req, res) => {
  try {
    if (hasCrudId(req)) {
      const [[role]] = await db.query(`SELECT * FROM roles WHERE id = ? AND status != 0`, {
        replacements: [req.query.id],
      });
      if (!role) return sendError(res, "Role not found", 404);
      await attachRolePermissions(role);
      return sendSuccess(res, "Role fetched", role);
    }

    const { page, limit, offset, search } = parseListQuery(req.query);
    let where = "WHERE status != 0";
    const params = [];
    const searchPart = buildLikeSearch(["name"], search);
    where += searchPart.clause;
    params.push(...searchPart.params);

    const [roles] = await db.query(
      `SELECT * FROM roles ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      { replacements: [...params, limit, offset] }
    );
    for (const role of roles) {
      await attachRolePermissions(role);
    }

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM roles ${where}`,
      { replacements: params }
    );

    return sendSuccess(res, "Roles fetched", listResult(roles, { page, limit, total }));
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const UpdateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, permissions = [], status } = req.body;
    if (name) {
      await db.query(`UPDATE roles SET name = ? WHERE id = ?`, { replacements: [name, id] });
    }
    if (status !== undefined) {
      await db.query(`UPDATE roles SET status = ? WHERE id = ?`, { replacements: [status, id] });
    }
    if (permissions.length) {
      await db.query(`DELETE FROM rolepermission WHERE role_id = ?`, { replacements: [id] });
      for (const permId of permissions) {
        await db.query(`INSERT INTO rolepermission (role_id, permission_id) VALUES (?, ?)`, {
          replacements: [id, permId],
        });
      }
    }
    return sendSuccess(res, "Role updated");
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const DeleteRole = async (req, res) => {
  try {
    const ids = getRecordIds(req);
    await softDeleteByIds("roles", ids);
    return sendSuccess(res, deleteSuccessMessage(ids.length), deleteSuccessPayload(ids));
  } catch (error) {
    return sendError(res, error.message, error.statusCode || 500);
  }
};
