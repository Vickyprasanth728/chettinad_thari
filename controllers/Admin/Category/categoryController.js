import { db, setSessionDefaults } from "../../../config/Database.js";
import { sendSuccess, sendError } from "../../../Utils/response.js";
import { hasCrudId } from "../../../Utils/crudQuery.js";
import { parseListQuery, buildLikeSearch, listResult } from "../../../Utils/listQuery.js";
import { getRecordIds, deleteSuccessMessage, deleteSuccessPayload, hardDeleteByIds } from "../../../Utils/bulkDelete.js";

async function getCategoryRow(id) {
  const [[row]] = await db.query(
    `SELECT c.*, p.name AS parent_name
     FROM product_categories c
     LEFT JOIN product_categories p ON p.id = c.parent_id
     WHERE c.id = ? AND c.status != 0`,
    { replacements: [id] }
  );
  return row;
}

async function assertUniqueName(name, parentId, excludeId = null) {
  let sql = `SELECT id FROM product_categories WHERE name = ? AND status != 0`;
  const params = [String(name).trim()];
  if (parentId === null) {
    sql += " AND parent_id IS NULL";
  } else {
    sql += " AND parent_id = ?";
    params.push(parentId);
  }
  if (excludeId) {
    sql += " AND id != ?";
    params.push(excludeId);
  }
  const [rows] = await db.query(sql, { replacements: params });
  if (rows.length > 0) {
    const err = new Error("Category name already exists");
    err.code = "DUPLICATE_NAME";
    throw err;
  }
}

async function validateParentId(parentId) {
  if (parentId === null || parentId === undefined || parentId === "") {
    return { ok: true, parentId: null };
  }
  const pid = Number(parentId);
  if (!Number.isInteger(pid) || pid <= 0) {
    return { ok: false, message: "Invalid parent_id" };
  }
  const [[parent]] = await db.query(
    `SELECT id, parent_id FROM product_categories WHERE id = ? AND status != 0`,
    { replacements: [pid] }
  );
  if (!parent) {
    return { ok: false, message: "Parent category not found" };
  }
  if (parent.parent_id !== null) {
    return { ok: false, message: "parent_id must reference a top-level category (subcategories cannot be parents)" };
  }
  return { ok: true, parentId: pid };
}

export const addCategory = async (req, res) => {
  try {
    await setSessionDefaults();
    const { name, parent_id, status = 1 } = req.body;
    if (!name || !String(name).trim()) {
      return sendError(res, "name is required");
    }

    const parentCheck = await validateParentId(parent_id);
    if (!parentCheck.ok) return sendError(res, parentCheck.message);

    await assertUniqueName(name, parentCheck.parentId);

    const [result] = await db.query(
      `INSERT INTO product_categories (name, parent_id, status) VALUES (?, ?, ?)`,
      { replacements: [String(name).trim(), parentCheck.parentId, status] }
    );
    const id = Number(result);
    return sendSuccess(res, "Category created", { id });
  } catch (error) {
    if (error.code === "DUPLICATE_NAME" || error.original?.code === "ER_DUP_ENTRY") {
      return sendError(res, error.message || "Category name already exists");
    }
    return sendError(res, error.message, 500);
  }
};

export const getCategories = async (req, res) => {
  if (hasCrudId(req)) return getCategoryById(req, res);
  try {
    await setSessionDefaults();
    const { parent_id, level, tree } = req.query;
    const { page, limit, offset, search } = parseListQuery(req.query, { defaultLimit: 50 });

    if (tree === "true") {
      const [parents] = await db.query(
        `SELECT id, name, parent_id, status FROM product_categories
         WHERE status != 0 AND parent_id IS NULL ORDER BY name`
      );
      const [children] = await db.query(
        `SELECT id, name, parent_id, status FROM product_categories
         WHERE status != 0 AND parent_id IS NOT NULL ORDER BY name`
      );
      const byParent = {};
      for (const c of children) {
        if (!byParent[c.parent_id]) byParent[c.parent_id] = [];
        byParent[c.parent_id].push(c);
      }
      const data = parents.map((p) => ({
        ...p,
        subcategories: byParent[p.id] || [],
      }));
      return sendSuccess(res, "Category tree", data);
    }

    let where = "WHERE c.status != 0";
    const params = [];

    if (level === "parent") {
      where += " AND c.parent_id IS NULL";
    } else if (level === "sub") {
      where += " AND c.parent_id IS NOT NULL";
    }

    if (parent_id !== undefined && parent_id !== "") {
      if (parent_id === "null" || parent_id === "0") {
        where += " AND c.parent_id IS NULL";
      } else {
        where += " AND c.parent_id = ?";
        params.push(Number(parent_id));
      }
    }

    const fromJoin = `FROM product_categories c
       LEFT JOIN product_categories p ON p.id = c.parent_id`;

    const searchPart = buildLikeSearch(["c.name", "p.name"], search);
    where += searchPart.clause;
    params.push(...searchPart.params);

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total ${fromJoin} ${where}`,
      { replacements: params }
    );

    const [rows] = await db.query(
      `SELECT c.id, c.name, c.parent_id, c.status, c.createdon, c.updatedon,
              p.name AS parent_name,
              (SELECT COUNT(*) FROM product_categories sc WHERE sc.parent_id = c.id AND sc.status != 0) AS subcategory_count
       ${fromJoin}
       ${where}
       ORDER BY c.parent_id IS NULL DESC, c.name ASC
       LIMIT ? OFFSET ?`,
      { replacements: [...params, limit, offset] }
    );

    return sendSuccess(res, "Categories fetched", listResult(rows, { page, limit, total }));
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const getCategoryById = async (req, res) => {
  const row = await getCategoryRow(req.query.id);
  if (!row) return sendError(res, "Category not found", 404);
  return sendSuccess(res, "Category detail", row);
};

export const updateCategory = async (req, res) => {
  try {
    const id = req.recordId ?? Number(req.params.id);
    const existing = req.existingRecord ?? (await getCategoryRow(id));
    if (!existing) return sendError(res, "Category not found", 404);

    const { name, parent_id, status } = req.body;

    if (parent_id !== undefined) {
      const parentCheck = await validateParentId(parent_id);
      if (!parentCheck.ok) return sendError(res, parentCheck.message);
      if (parentCheck.parentId === id) {
        return sendError(res, "Category cannot be its own parent");
      }
      const [[childCount]] = await db.query(
        `SELECT COUNT(*) AS cnt FROM product_categories WHERE parent_id = ? AND status != 0`,
        { replacements: [id] }
      );
      if (Number(childCount.cnt) > 0 && parentCheck.parentId !== null) {
        return sendError(res, "Cannot assign a parent to a category that has subcategories");
      }
    }

    const updates = [];
    const params = [];
    if (name !== undefined) {
      updates.push("name = ?");
      params.push(String(name).trim());
    }
    if (parent_id !== undefined) {
      const parentCheck = await validateParentId(parent_id);
      updates.push("parent_id = ?");
      params.push(parentCheck.parentId);
    }
    if (status !== undefined) {
      updates.push("status = ?");
      params.push(status);
    }
    if (!updates.length) return sendError(res, "No fields to update");

    const nextName = name !== undefined ? String(name).trim() : existing.name;
    let nextParentId = existing.parent_id;
    if (parent_id !== undefined) {
      const parentCheck = await validateParentId(parent_id);
      nextParentId = parentCheck.parentId;
    }
    await assertUniqueName(nextName, nextParentId, id);

    params.push(id);
    await db.query(`UPDATE product_categories SET ${updates.join(", ")} WHERE id = ?`, {
      replacements: params,
    });
    return sendSuccess(res, "Category updated");
  } catch (error) {
    if (error.code === "DUPLICATE_NAME" || error.original?.code === "ER_DUP_ENTRY") {
      return sendError(res, error.message || "Category name already exists");
    }
    return sendError(res, error.message, 500);
  }
};

export async function assertCategoryDeletable(ids) {
  for (const id of ids) {
    // Count all child rows (including status=0): parent_id FK is ON DELETE RESTRICT
    const [[{ childCount }]] = await db.query(
      `SELECT COUNT(*) AS childCount FROM product_categories WHERE parent_id = ?`,
      { replacements: [id] }
    );
    if (Number(childCount) > 0) {
      const err = new Error(`Cannot delete category ${id} with subcategories. Delete subcategories first.`);
      err.statusCode = 409;
      throw err;
    }

    // Count all products (including status=0): products.category_id FK blocks hard delete
    const [[{ productCount }]] = await db.query(
      `SELECT COUNT(*) AS productCount FROM products WHERE category_id = ?`,
      { replacements: [id] }
    );
    if (Number(productCount) > 0) {
      const err = new Error(`Cannot delete category ${id} linked to products`);
      err.statusCode = 409;
      throw err;
    }
  }
}

export const deleteCategory = async (req, res) => {
  try {
    const ids = getRecordIds(req);
    await assertCategoryDeletable(ids);
    await hardDeleteByIds("product_categories", ids);
    return sendSuccess(res, deleteSuccessMessage(ids.length), deleteSuccessPayload(ids));
  } catch (error) {
    if (error?.original?.code === "ER_ROW_IS_REFERENCED_2") {
      return sendError(res, "Cannot delete category linked to other records", 409);
    }
    return sendError(res, error.message, error.statusCode || 500);
  }
};

export const getCategoryDropdown = async (req, res) => {
  try {
    await setSessionDefaults();
    const { parent_id, level } = req.query;
    let where = "WHERE status != 0";
    const params = [];

    if (level === "parent" || parent_id === "null" || parent_id === "") {
      where += " AND parent_id IS NULL";
    } else if (parent_id) {
      where += " AND parent_id = ?";
      params.push(Number(parent_id));
    }

    const [rows] = await db.query(
      `SELECT id, name, parent_id FROM product_categories ${where} ORDER BY name`,
      { replacements: params }
    );
    return sendSuccess(res, "Category dropdown", rows);
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export async function validateProductCategoryId(categoryId) {
  if (categoryId === null || categoryId === undefined || categoryId === "") {
    return { ok: true, categoryId: null };
  }
  const cid = Number(categoryId);
  if (!Number.isInteger(cid) || cid <= 0) {
    return { ok: false, message: "Invalid category_id" };
  }
  const [[row]] = await db.query(
    `SELECT id FROM product_categories WHERE id = ? AND status != 0`,
    { replacements: [cid] }
  );
  if (!row) return { ok: false, message: "Category not found" };
  return { ok: true, categoryId: cid };
}

/**
 * Resolve bulk-upload Category + Sub Category names to the subcategory id.
 * Category must be a parent row (parent_id IS NULL).
 * Sub Category must be a child of that parent (parent_id = parent.id).
 */
export async function resolveBulkCategoryPairOrError(categoryName, subCategoryName) {
  const parentName = String(categoryName ?? "").trim();
  const subName = String(subCategoryName ?? "").trim();

  if (!parentName) return { error: "Category is mandatory" };
  if (!subName) return { error: "Sub Category is mandatory" };

  const [[parentCategory]] = await db.query(
    `SELECT id, name, parent_id
     FROM product_categories
     WHERE name = ? AND parent_id IS NULL AND status != 0
     LIMIT 1`,
    { replacements: [parentName] }
  );

  if (!parentCategory) {
    const [[categoryAsChild]] = await db.query(
      `SELECT c.id, p.name AS parent_name
       FROM product_categories c
       LEFT JOIN product_categories p ON p.id = c.parent_id
       WHERE c.name = ? AND c.parent_id IS NOT NULL AND c.status != 0
       LIMIT 1`,
      { replacements: [parentName] }
    );
    if (categoryAsChild) {
      return {
        error: `Category '${parentName}' is a Sub Category under '${categoryAsChild.parent_name}', not a parent Category`,
      };
    }
    return { error: `Category not found: ${parentName}` };
  }

  const [[subCategory]] = await db.query(
    `SELECT id, name, parent_id
     FROM product_categories
     WHERE name = ? AND parent_id = ? AND status != 0
     LIMIT 1`,
    { replacements: [subName, parentCategory.id] }
  );

  if (!subCategory) {
    const [[subAsParent]] = await db.query(
      `SELECT id FROM product_categories
       WHERE name = ? AND parent_id IS NULL AND status != 0
       LIMIT 1`,
      { replacements: [subName] }
    );
    if (subAsParent) {
      return {
        error: `Sub Category '${subName}' is a parent Category. Use it in the Category column and pick a child Sub Category`,
      };
    }

    const [otherParents] = await db.query(
      `SELECT DISTINCT p.name AS parent_name
       FROM product_categories c
       INNER JOIN product_categories p ON p.id = c.parent_id AND p.status != 0
       WHERE c.name = ? AND c.parent_id IS NOT NULL AND c.status != 0`,
      { replacements: [subName] }
    );
    if (otherParents.length) {
      const parentNames = otherParents.map((row) => row.parent_name).join(", ");
      return {
        error: `Sub Category '${subName}' not found under Category '${parentName}'. It exists under: ${parentNames}`,
      };
    }

    return { error: `Sub Category not found: ${subName} under Category ${parentName}` };
  }

  return {
    categoryId: subCategory.id,
    parentCategoryId: parentCategory.id,
    parentCategoryName: parentCategory.name,
    subCategoryName: subCategory.name,
  };
}

export const checkCategoryNameUnique = async (req, res) => {
  try {
    const { name, parent_id, exclude_id } = req.body;
    if (!name) return sendError(res, "name is required");

    const parentCheck = await validateParentId(parent_id ?? null);
    if (!parentCheck.ok) return sendError(res, parentCheck.message);

    let sql = `SELECT id FROM product_categories WHERE name = ? AND status != 0`;
    const params = [String(name).trim()];

    if (parentCheck.parentId === null) {
      sql += " AND parent_id IS NULL";
    } else {
      sql += " AND parent_id = ?";
      params.push(parentCheck.parentId);
    }
    if (exclude_id) {
      sql += " AND id != ?";
      params.push(Number(exclude_id));
    }

    const [rows] = await db.query(sql, { replacements: params });
    return sendSuccess(res, "Checked", { unique: rows.length === 0 });
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};
