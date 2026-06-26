import { db, setSessionDefaults } from "../../../config/Database.js";
import { sendSuccess, sendError } from "../../../Utils/response.js";
import {
  DEFAULT_RECEIPT_HTML,
  RECEIPT_TEMPLATE_NAME,
  RECEIPT_TEMPLATE_PLACEHOLDERS,
  RECEIPT_ROW_EXAMPLES,
} from "../../../Utils/receiptTemplateDefaults.js";
import { parseListQuery, buildLikeSearch, listResult } from "../../../Utils/listQuery.js";

const MAX_TEMPLATE_LENGTH = 512 * 1024;

const TEMPLATE_SELECT = `
  SELECT t.id, t.name, t.value,
         t.createdby, t.createdon, t.updatedby, t.updatedon,
         cu.name AS created_by_name, uu.name AS updated_by_name
  FROM print_receipt_template t
  LEFT JOIN users cu ON cu.id = t.createdby
  LEFT JOIN users uu ON uu.id = t.updatedby
`;

async function fetchTemplatesPaged({ limit, offset, search }) {
  let where = "WHERE 1=1";
  const params = [];
  const searchPart = buildLikeSearch(["t.name"], search);
  where += searchPart.clause;
  params.push(...searchPart.params);

  const [rows] = await db.query(
    `${TEMPLATE_SELECT} ${where} ORDER BY t.id ASC LIMIT ? OFFSET ?`,
    { replacements: [...params, limit, offset] }
  );
  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM print_receipt_template t ${where}`,
    { replacements: params }
  );
  return { rows, total };
}

async function fetchTemplateById(id) {
  const [[row]] = await db.query(`${TEMPLATE_SELECT} WHERE t.id = ? LIMIT 1`, {
    replacements: [id],
  });
  return row || null;
}

async function fetchTemplate(name = RECEIPT_TEMPLATE_NAME) {
  const [[row]] = await db.query(`${TEMPLATE_SELECT} WHERE t.name = ? LIMIT 1`, {
    replacements: [name],
  });
  return row || null;
}

async function ensureDefaultTemplate() {
  const existing = await fetchTemplate();
  if (existing) return existing;

  const [insertId] = await db.query(
    `INSERT INTO print_receipt_template (name, value) VALUES (?, ?)`,
    { replacements: [RECEIPT_TEMPLATE_NAME, DEFAULT_RECEIPT_HTML] }
  );
  return fetchTemplateById(Number(insertId));
}

function formatTemplateResponse(row) {
  return {
    id: row.id,
    name: row.name,
    value: row.value,
    created_by: row.createdby ?? null,
    created_at: row.createdon ?? null,
    updated_by: row.updatedby ?? null,
    updated_at: row.updatedon ?? null,
    created_by_name: row.created_by_name ?? null,
    updated_by_name: row.updated_by_name ?? null,
    placeholders: RECEIPT_TEMPLATE_PLACEHOLDERS,
    row_examples: RECEIPT_ROW_EXAMPLES,
  };
}

/** GET /api/v1/settings/receipt-html — list all, or one with ?id= or ?name= */
export const getReceiptHtml = async (req, res) => {
  try {
    await setSessionDefaults();

    const { id, name } = req.query;

    if (id) {
      const row = await fetchTemplateById(id);
      if (!row) return sendError(res, "Receipt template not found", 404);
      return sendSuccess(res, "Receipt HTML template", formatTemplateResponse(row));
    }

    if (name) {
      const row = await fetchTemplate(String(name).trim());
      if (!row) return sendError(res, "Receipt template not found", 404);
      return sendSuccess(res, "Receipt HTML template", formatTemplateResponse(row));
    }

    const { page, limit, offset, search } = parseListQuery(req.query);

    let { rows, total } = await fetchTemplatesPaged({ limit, offset, search });
    if (!total) {
      await ensureDefaultTemplate();
      ({ rows, total } = await fetchTemplatesPaged({ limit, offset, search }));
    }

    return sendSuccess(
      res,
      "Receipt HTML templates",
      listResult(rows.map(formatTemplateResponse), { page, limit, total })
    );
  } catch (error) {
    return sendError(res, error.message || "Failed to fetch receipt template", 500);
  }
};

/** PUT /api/v1/settings/receipt-html — update by id or name; create when neither exists */
export const updateReceiptHtml = async (req, res) => {
  try {
    await setSessionDefaults();
    const { id, value, name = RECEIPT_TEMPLATE_NAME } = req.body || {};
    const userId = req.user?.id ?? null;

    if (value === undefined || value === null) {
      return sendError(res, "Template HTML (value) is required", 400);
    }
    if (typeof value !== "string") {
      return sendError(res, "Template HTML (value) must be a string", 400);
    }
    if (!String(value).trim()) {
      return sendError(res, "Template HTML (value) cannot be empty", 400);
    }
    if (value.length > MAX_TEMPLATE_LENGTH) {
      return sendError(res, `Template HTML exceeds maximum length of ${MAX_TEMPLATE_LENGTH} characters`, 400);
    }

    if (id) {
      const existing = await fetchTemplateById(id);
      if (!existing) return sendError(res, "Receipt template not found", 404);

      const templateName = name !== undefined ? String(name).trim() : existing.name;
      if (!templateName) return sendError(res, "Template name cannot be empty", 400);

      await db.query(
        `UPDATE print_receipt_template SET name = ?, value = ?, updatedby = ? WHERE id = ?`,
        { replacements: [templateName, value, userId, id] }
      );
      const row = await fetchTemplateById(id);
      return sendSuccess(res, "Receipt HTML template updated", formatTemplateResponse(row));
    }

    const templateName = String(name).trim() || RECEIPT_TEMPLATE_NAME;
    const existing = await fetchTemplate(templateName);

    if (existing) {
      await db.query(`UPDATE print_receipt_template SET value = ?, updatedby = ? WHERE id = ?`, {
        replacements: [value, userId, existing.id],
      });
      const row = await fetchTemplateById(existing.id);
      return sendSuccess(res, "Receipt HTML template updated", formatTemplateResponse(row));
    }

    const [insertId] = await db.query(
      `INSERT INTO print_receipt_template (name, value, createdby, updatedby) VALUES (?, ?, ?, ?)`,
      { replacements: [templateName, value, userId, userId] }
    );
    const row = await fetchTemplateById(Number(insertId));
    return sendSuccess(res, "Receipt HTML template created", formatTemplateResponse(row));
  } catch (error) {
    if (error?.name === "SequelizeUniqueConstraintError" || error?.parent?.code === "ER_DUP_ENTRY") {
      return sendError(res, "A template with this name already exists", 409);
    }
    return sendError(res, error.message || "Failed to update receipt template", 500);
  }
};

/** Used by print receipt flow — returns raw template HTML or default */
export async function getReceiptTemplateHtml(nameOrId = RECEIPT_TEMPLATE_NAME) {
  let row = null;
  if (nameOrId !== null && nameOrId !== undefined && /^\d+$/.test(String(nameOrId))) {
    row = await fetchTemplateById(nameOrId);
  } else {
    row = await fetchTemplate(String(nameOrId));
  }
  if (row?.value) return row.value;
  return DEFAULT_RECEIPT_HTML;
}
