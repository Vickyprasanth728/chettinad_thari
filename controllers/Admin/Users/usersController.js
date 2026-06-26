import bcrypt from "bcrypt";
import { db, setSessionDefaults } from "../../../config/Database.js";
import { sendSuccess, sendError } from "../../../Utils/response.js";
import { hasCrudId } from "../../../Utils/crudQuery.js";
import { parseListQuery, buildLikeSearch, listResult } from "../../../Utils/listQuery.js";
import { getRecordIds, deleteSuccessMessage, deleteSuccessPayload, softDeleteByIds } from "../../../Utils/bulkDelete.js";

const nullIfEmpty = (value) =>
  value === undefined || value === null || value === "" ? null : value;

export const AddUser = async (req, res) => {
  try {
    await setSessionDefaults();
    const { username, password, name, email, mobileno, role_id, status = 1 } = req.body;
    if (!username || !password || !role_id) {
      return sendError(res, "username, password and role_id are required");
    }
    const normalizedUsername = username.trim().toLowerCase();
    const hashed = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      `INSERT INTO users (username, password, name, email, mobileno, role_id, status, createdby)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      {
        replacements: [
          normalizedUsername,
          hashed,
          nullIfEmpty(name) ?? normalizedUsername,
          nullIfEmpty(email),
          mobileno != null && mobileno !== "" ? String(mobileno) : null,
          Number(role_id),
          status,
          req.user?.id ?? null,
        ],
      }
    );
    return sendSuccess(res, "User created", { id: result });
  } catch (error) {
    if (error.original?.code === "ER_DUP_ENTRY") {
      return sendError(res, "Username, email or mobile already exists");
    }
    return sendError(res, error.message, 500);
  }
};

async function fetchUserById(id) {
  const [[user]] = await db.query(
    `SELECT u.id, u.username, u.name, u.email, u.mobileno, u.role_id, u.status,
            u.createdon, u.updatedon, r.name AS role_name
     FROM users u
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE u.id = ? AND u.status != 0`,
    { replacements: [id] }
  );
  return user;
}

export const GetUsers = async (req, res) => {
  try {
    await setSessionDefaults();

    if (hasCrudId(req)) {
      const user = await fetchUserById(req.query.id);
      if (!user) return sendError(res, "User not found", 404);
      return sendSuccess(res, "User fetched", user);
    }

    const { page, limit, offset, search } = parseListQuery(req.query, { defaultLimit: 20 });
    const roleId = req.query.role_id;

    let where = "WHERE u.status != 0";
    const params = [];
    const searchPart = buildLikeSearch(
      ["u.username", "u.name", "u.email", "u.mobileno"],
      search
    );
    where += searchPart.clause;
    params.push(...searchPart.params);
    if (roleId) {
      where += " AND u.role_id = ?";
      params.push(roleId);
    }

    const [users] = await db.query(
      `SELECT u.id, u.username, u.name, u.email, u.mobileno, u.role_id, u.status, r.name AS role_name
       FROM users u LEFT JOIN roles r ON r.id = u.role_id ${where}
       ORDER BY u.id DESC LIMIT ? OFFSET ?`,
      { replacements: [...params, limit, offset] }
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM users u ${where}`,
      { replacements: params }
    );
    return sendSuccess(res, "Users fetched", listResult(users, { page, limit, total }));
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const UpdateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, name, email, mobileno, role_id, status } = req.body;
    const fields = [];
    const params = [];
    if (username) { fields.push("username = ?"); params.push(username.trim().toLowerCase()); }
    if (password) { fields.push("password = ?"); params.push(await bcrypt.hash(password, 10)); }
    if (name !== undefined) { fields.push("name = ?"); params.push(name); }
    if (email !== undefined) { fields.push("email = ?"); params.push(email); }
    if (mobileno !== undefined) { fields.push("mobileno = ?"); params.push(mobileno); }
    if (role_id) { fields.push("role_id = ?"); params.push(role_id); }
    if (status !== undefined) { fields.push("status = ?"); params.push(status); }
    fields.push("updatedby = ?");
    params.push(req.user.id);
    params.push(id);

    await db.query(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, { replacements: params });
    return sendSuccess(res, "User updated");
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const DeleteUser = async (req, res) => {
  try {
    const ids = getRecordIds(req);
    await softDeleteByIds("users", ids, {
      setClause: "status = 0, updatedby = ?",
      setParams: [req.user.id],
    });
    return sendSuccess(res, deleteSuccessMessage(ids.length), deleteSuccessPayload(ids));
  } catch (error) {
    return sendError(res, error.message, error.statusCode || 500);
  }
};

export const checkUsernameUnique = async (req, res) => {
  const { username, exclude_id } = req.body;
  let q = `SELECT id FROM users WHERE username = ? AND status != 0`;
  const params = [username?.trim().toLowerCase()];
  if (exclude_id) { q += ` AND id != ?`; params.push(exclude_id); }
  const [rows] = await db.query(q, { replacements: params });
  return sendSuccess(res, "Checked", { unique: rows.length === 0 });
};

export const checkMobileUnique = async (req, res) => {
  const { mobileno, exclude_id } = req.body;
  let q = `SELECT id FROM users WHERE mobileno = ? AND status != 0`;
  const params = [mobileno];
  if (exclude_id) { q += ` AND id != ?`; params.push(exclude_id); }
  const [rows] = await db.query(q, { replacements: params });
  return sendSuccess(res, "Checked", { unique: rows.length === 0 });
};

export const checkEmailUnique = async (req, res) => {
  const { email, exclude_id } = req.body;
  let q = `SELECT id FROM users WHERE email = ? AND status != 0`;
  const params = [email];
  if (exclude_id) { q += ` AND id != ?`; params.push(exclude_id); }
  const [rows] = await db.query(q, { replacements: params });
  return sendSuccess(res, "Checked", { unique: rows.length === 0 });
};

export const getStaffList = async (req, res) => {
  try {
    const [staff] = await db.query(
      `SELECT u.id, u.name, u.username, r.name AS role_name
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.status = 1 AND r.name IN ('Billing Staff', 'Admin')
       ORDER BY u.name`
    );
    return sendSuccess(res, "Staff list", staff);
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};
