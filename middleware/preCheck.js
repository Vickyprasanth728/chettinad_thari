import { master_configuration, ALLOWED_TABLES } from "../config/master_config.js";
import { db } from "../config/Database.js";
import {
  sanitizeMasterInput,
  validateMasterData,
  assertUniqueFields,
  getIdField,
} from "../Utils/masterValidation.js";
import { assertRecordExists, assertRecordsExist, activeFilterForTable, parseRecordId, parseRecordIds } from "../Utils/recordExists.js";
import { sendError } from "../Utils/response.js";

export const PrecheckMiddleware = async (req, res, next) => {
  try {
    const table = req.params.table;
    if (!ALLOWED_TABLES.includes(table)) {
      return res.status(400).json({ status: false, message: "Invalid table" });
    }
    const config = master_configuration()[table];
    if (!config) return res.status(400).json({ status: false, message: "Table not configured" });

    const mode = req.method === "PUT" ? "update" : "create";
    let data = sanitizeMasterInput(req.body, config);
    if (config.transform) data = await config.transform(data);

    validateMasterData(data, config, { mode });

    if (mode === "create") {
      await assertUniqueFields(db, data, config);
    } else if (req.params.id) {
      const idField = getIdField(config);
      const hasStatus = config.fields.some((f) => f.name === "status");
      parseRecordId(req.params.id);
      await assertRecordExists(config.table, req.params.id, {
        idColumn: idField,
        activeFilter: activeFilterForTable(config.table, hasStatus),
        notFoundMessage: "Record not found",
      });
      await assertUniqueFields(db, data, config, req.params.id);
    }

    req.masterData = data;
    req.masterConfig = config;
    next();
  } catch (error) {
    return res.status(400).json({ status: false, message: error.message });
  }
};

export const GetCheckMiddleware = async (req, res, next) => {
  try {
    const table = req.params.table;
    if (!ALLOWED_TABLES.includes(table)) {
      return res.status(400).json({ status: false, message: "Invalid table" });
    }
    const config = master_configuration()[table];
    req.masterConfig = config;

    if (req.method === "DELETE" && req.params.id) {
      const idField = getIdField(config);
      const hasStatus = config.fields.some((f) => f.name === "status");
      const ids = parseRecordIds(req.params.id);
      const rows = await assertRecordsExist(config.table, ids, {
        idColumn: idField,
        activeFilter: activeFilterForTable(config.table, hasStatus),
        notFoundMessage: "Record not found",
      });
      req.recordIds = ids;
      req.recordId = ids[0];
      req.existingRecords = rows;
      req.existingRecord = rows[0];
    }

    next();
  } catch (error) {
    return sendError(res, error.message, error.statusCode || 400);
  }
};
