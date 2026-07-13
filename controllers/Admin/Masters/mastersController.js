import { db, setSessionDefaults } from "../../../config/Database.js";
import { master_configuration, ALLOWED_TABLES } from "../../../config/master_config.js";
import { sendSuccess, sendError } from "../../../Utils/response.js";
import { getRecordIds, deleteSuccessMessage, deleteSuccessPayload, softDeleteByIds, hardDeleteByIds } from "../../../Utils/bulkDelete.js";
import { hasCrudId, getCrudId } from "../../../Utils/crudQuery.js";
import { parseListQuery, buildLikeSearch, listResult } from "../../../Utils/listQuery.js";
import { assertUniqueFields, buildWritePayload, getIdField } from "../../../Utils/masterValidation.js";
import { assertGstDeletable } from "../GST/gstController.js";

export const handleAdd = async (req, res) => {
  try {
    await setSessionDefaults();
    const { masterConfig, masterData } = req;
    const { fields, values } = buildWritePayload(masterData, masterConfig, { mode: "create" });
    const cols = fields.join(", ");
    const placeholders = fields.map(() => "?").join(", ");
    const [result] = await db.query(
      `INSERT INTO ${masterConfig.table} (${cols}) VALUES (${placeholders})`,
      { replacements: values }
    );
    return sendSuccess(res, "Record created", { id: result });
  } catch (error) {
    if (error.original?.code === "ER_DUP_ENTRY") {
      return sendError(res, "Duplicate entry");
    }
    return sendError(res, error.message, 500);
  }
};

export const handleGet = async (req, res) => {
  try {
    await setSessionDefaults();
    const table = req.params.table;
    const config = master_configuration()[table];
    if (!config) return sendError(res, "Invalid table");

    const { page, limit, offset, search } = parseListQuery(req.query, { defaultLimit: 50 });
    const gmasterId = req.query.gmaster_id;

    let where = "WHERE 1=1";
    const params = [];

    if (config.table === "gmastervalue" && gmasterId) {
      where += ` AND gmaster_id = ?`;
      params.push(gmasterId);
    }
    if (search) {
      const stringFields = config.fields
        .filter((f) => f.type === "string")
        .map((f) => f.name);
      const searchColumns = stringFields.length ? stringFields : ["name"];
      const searchPart = buildLikeSearch(searchColumns, search);
      where += searchPart.clause;
      params.push(...searchPart.params);
    }
    if (config.fields.some((f) => f.name === "status")) {
      where += ` AND status != 0`;
    }

    const idField = getIdField(config);

    if (hasCrudId(req)) {
      let detailSql = `SELECT * FROM ${config.table} WHERE ${idField} = ?`;
      const detailParams = [getCrudId(req)];
      if (config.fields.some((f) => f.name === "status")) {
        detailSql += ` AND status != 0`;
      }
      const [rows] = await db.query(detailSql, { replacements: detailParams });
      if (!rows.length) return sendError(res, "Record not found", 404);
      return sendSuccess(res, "Record fetched", rows[0]);
    }

    const [rows] = await db.query(
      `SELECT * FROM ${config.table} ${where} ORDER BY ${idField} DESC LIMIT ? OFFSET ?`,
      { replacements: [...params, limit, offset] }
    );
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM ${config.table} ${where}`,
      { replacements: params }
    );

    return sendSuccess(res, "Records fetched", listResult(rows, { page, limit, total }));
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const handleUpdate = async (req, res) => {
  try {
    await setSessionDefaults();
    const { masterConfig, masterData } = req;
    const idField = getIdField(masterConfig);
    const { fields, values } = buildWritePayload(masterData, masterConfig, { mode: "update" });
    if (!fields.length) return sendError(res, "No fields to update");
    const setClause = fields.map((f) => `${f} = ?`).join(", ");
    await db.query(`UPDATE ${masterConfig.table} SET ${setClause} WHERE ${idField} = ?`, {
      replacements: [...values, req.params.id],
    });
    return sendSuccess(res, "Record updated");
  } catch (error) {
    if (error.original?.code === "ER_DUP_ENTRY") {
      return sendError(res, "Duplicate entry");
    }
    return sendError(res, error.message, 500);
  }
};

export const handleDelete = async (req, res) => {
  try {
    const config = req.masterConfig || master_configuration()[req.params.table];
    const idField = getIdField(config);
    const ids = getRecordIds(req);
    const hasStatus = config.fields.some((f) => f.name === "status");

    if (config.hardDelete) {
      if (config.table === "gst") await assertGstDeletable(ids);
      await hardDeleteByIds(config.table, ids, { idColumn: idField });
    } else if (hasStatus) {
      await softDeleteByIds(config.table, ids, { idColumn: idField });
    } else {
      await hardDeleteByIds(config.table, ids, { idColumn: idField });
    }

    return sendSuccess(res, deleteSuccessMessage(ids.length), deleteSuccessPayload(ids));
  } catch (error) {
    return sendError(res, error.message, error.statusCode || 500);
  }
};

export const checkDesignCodeUnique = async (req, res) => {
  const { design_code, exclude_id } = req.body;
  let q = `SELECT id FROM design_master WHERE design_code = ? AND status != 0`;
  const params = [design_code];
  if (exclude_id) { q += ` AND id != ?`; params.push(exclude_id); }
  const [rows] = await db.query(q, { replacements: params });
  return sendSuccess(res, "Checked", { unique: rows.length === 0 });
};

/** Generic unique check for master fields — POST /:table/check-unique */
export const checkMasterFieldUnique = async (req, res) => {
  try {
    const table = req.params.table;
    if (!ALLOWED_TABLES.includes(table)) {
      return sendError(res, "Invalid table", 400);
    }
    const config = master_configuration()[table];
    if (!config) return sendError(res, "Table not configured", 400);

    const { field, value, exclude_id, ...scopeValues } = req.body;
    if (!field || value === undefined || value === null || value === "") {
      return sendError(res, "field and value are required");
    }

    const fieldDef = config.fields.find((f) => f.name === field);
    if (!fieldDef?.unique) {
      return sendError(res, `Field ${field} is not configured for uniqueness check`);
    }

    const data = { [field]: value, ...scopeValues };
    if (config.uniqueScope?.length) {
      for (const scopeField of config.uniqueScope) {
        if (scopeValues[scopeField] === undefined || scopeValues[scopeField] === "") {
          return sendError(res, `${scopeField} is required for this uniqueness check`);
        }
      }
    }

    await assertUniqueFields(db, data, config, exclude_id ?? null);
    return sendSuccess(res, "Checked", { unique: true });
  } catch (error) {
    if (error.message?.includes("already exists")) {
      return sendSuccess(res, "Checked", { unique: false });
    }
    return sendError(res, error.message, 400);
  }
};
