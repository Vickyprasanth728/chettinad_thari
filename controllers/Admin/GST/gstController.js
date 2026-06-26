import { db, setSessionDefaults } from "../../../config/Database.js";

import { sendSuccess, sendError } from "../../../Utils/response.js";

import { respondDbError } from "../../../Utils/dbError.js";
import { getRecordIds, deleteSuccessMessage, deleteSuccessPayload, softDeleteByIds } from "../../../Utils/bulkDelete.js";

import { hasCrudId, sqlReplacements } from "../../../Utils/crudQuery.js";

import { parseListQuery, buildLikeSearch, listResult } from "../../../Utils/listQuery.js";



const GST_TYPES = new Set(["inclusive", "exclusive"]);



async function assertGstNameUnique(name, excludeId = null) {

  const trimmed = String(name).trim();

  if (!trimmed) {

    const err = new Error("name is required");

    err.statusCode = 400;

    throw err;

  }

  const params = [trimmed];

  let sql = `SELECT id FROM gst WHERE name = ? AND status != 0`;

  if (excludeId != null) {

    sql += ` AND id != ?`;

    params.push(excludeId);

  }

  const [[row]] = await db.query(sql, { replacements: params });

  if (row) {

    const err = new Error("GST name already exists");

    err.statusCode = 409;

    throw err;

  }

  return trimmed;

}



function normalizeGstType(type) {

  if (type === undefined || type === null || type === "") return undefined;

  const value = String(type).toLowerCase();

  if (!GST_TYPES.has(value)) {

    const err = new Error("type must be inclusive or exclusive");

    err.statusCode = 400;

    throw err;

  }

  return value;

}



function normalizeGstTax(tax) {

  if (tax === undefined || tax === null || tax === "") return undefined;

  const value = Number(tax);

  if (!Number.isFinite(value) || value < 0) {

    const err = new Error("tax must be a valid non-negative number");

    err.statusCode = 400;

    throw err;

  }

  return value;

}



export const AddGst = async (req, res) => {

  try {

    await setSessionDefaults();

    const { name, tax, type, status = 1 } = req.body;

    const normalizedName = await assertGstNameUnique(name);

    const normalizedTax = normalizeGstTax(tax);

    if (normalizedTax === undefined) return sendError(res, "tax is required", 400);

    const normalizedType = normalizeGstType(type) ?? "inclusive";



    const [id] = await db.query(`INSERT INTO gst (name, tax, type, status) VALUES (?, ?, ?, ?)`, {

      replacements: [normalizedName, normalizedTax, normalizedType, status],

    });

    return sendSuccess(res, "GST created", { id });

  } catch (error) {

    if (error.statusCode) return sendError(res, error.message, error.statusCode);

    return respondDbError(res, error, "Failed to create GST");

  }

};



export const GetGst = async (req, res) => {

  try {

    if (hasCrudId(req)) {

      const [[row]] = await db.query(`SELECT * FROM gst WHERE id = ? AND status != 0`, {

        replacements: [req.query.id],

      });

      if (!row) return sendError(res, "GST not found", 404);

      return sendSuccess(res, "GST fetched", row);

    }



    const { page, limit, offset, search } = parseListQuery(req.query);

    let where = "WHERE status != 0";

    const params = [];

    const searchPart = buildLikeSearch(["name", "type"], search);

    where += searchPart.clause;

    params.push(...searchPart.params);



    const [rows] = await db.query(

      `SELECT * FROM gst ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,

      { replacements: [...params, limit, offset] }

    );

    const [[{ total }]] = await db.query(

      `SELECT COUNT(*) AS total FROM gst ${where}`,

      { replacements: params }

    );



    return sendSuccess(res, "GST list", listResult(rows, { page, limit, total }));

  } catch (error) {

    return sendError(res, error.message, 500);

  }

};



export const UpdateGst = async (req, res) => {

  try {

    await setSessionDefaults();

    let { name, tax, type, status } = req.body;



    if (name !== undefined) {

      name = await assertGstNameUnique(name, req.params.id);

    }

    if (type !== undefined) {

      type = normalizeGstType(type);

    }

    if (tax !== undefined) {

      tax = normalizeGstTax(tax);

    }



    await db.query(

      `UPDATE gst SET name=COALESCE(?,name), tax=COALESCE(?,tax), type=COALESCE(?,type), status=COALESCE(?,status) WHERE id=?`,

      { replacements: sqlReplacements(name, tax, type, status, req.params.id) }

    );

    return sendSuccess(res, "GST updated");

  } catch (error) {

    if (error.statusCode) return sendError(res, error.message, error.statusCode);

    return respondDbError(res, error, "Failed to update GST");

  }

};



export const DeleteGst = async (req, res) => {

  try {

    await setSessionDefaults();

    const ids = getRecordIds(req);
    await softDeleteByIds("gst", ids);

    return sendSuccess(res, deleteSuccessMessage(ids.length), deleteSuccessPayload(ids));

  } catch (error) {

    return respondDbError(res, error, "Failed to delete GST");

  }

};


