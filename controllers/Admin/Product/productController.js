import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import multer from "multer";
import xlsx from "xlsx";
import { db, setSessionDefaults } from "../../../config/Database.js";
import { sendSuccess, sendError, sendReportSuccess } from "../../../Utils/response.js";
import { respondDbError, getReadableDbErrorMessage } from "../../../Utils/dbError.js";
import { hasCrudId, getCrudId, sqlReplacements } from "../../../Utils/crudQuery.js";
import { buildLikeSearch, parseReportPagination } from "../../../Utils/listQuery.js";
import { appendStockNoRangeWhere } from "../../../Utils/stockNoRange.js";
import { logInventoryChange } from "../../../Utils/inventoryHelper.js";
import { validateProductCategoryId, resolveBulkCategoryPairOrError } from "../Category/categoryController.js";
import {
  attachPrimaryImagesToProducts,
  attachImagesToProductDetail,
  saveProductImage,
  deleteProductImage,
} from "../../../Utils/productImageHelper.js";
import { resolveProductTotalPrice, attachTotalPrice, attachTotalPriceToProducts } from "../../../Utils/gstCalculator.js";
import { getRecordIds, deleteSuccessMessage, deleteSuccessPayload } from "../../../Utils/bulkDelete.js";
import {
  validateProductPricingFields,
  validateDiscountAgainstPrice,
} from "../../../Utils/productValidation.js";

const uploadDir = path.join(process.cwd(), "uploads", "bulk");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const bulkErrorsDir = path.join(process.cwd(), "uploads", "bulk-errors");
if (!fs.existsSync(bulkErrorsDir)) fs.mkdirSync(bulkErrorsDir, { recursive: true });

const productImageTmpDir = path.join(process.cwd(), "uploads", "products", "_tmp");
if (!fs.existsSync(productImageTmpDir)) fs.mkdirSync(productImageTmpDir, { recursive: true });

const BULK_UPLOAD_HEADERS = [
  "Stock No",
  "Item Description",
  "Vendor Code",
  "Design Code",
  "HSN Code",
  "Retail Price",
  "Before Discount",
  "GST",
  "Base UOM",
  "Closing Bal.Qty",
  "Category",
  "Sub Category",
];

const BULK_DEFAULT_LOW_STOCK_THRESHOLD = 5;

const VIEW_STATUS_FILTERS = {
  instock: " AND p.quantity > 0",
  published: " AND p.published = 1",
  unpublished: " AND COALESCE(p.published, 0) = 0",
  low_stock: " AND p.quantity <= p.low_stock_threshold",
};

function resolveViewStatusFilter(viewStatus, legacyStatus) {
  const raw = viewStatus ?? legacyStatus;
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return { applied: false };
  }

  const key = String(raw).toLowerCase().trim();
  const whereClause = VIEW_STATUS_FILTERS[key];
  if (!whereClause) return { applied: false, invalid: true };

  return {
    applied: true,
    invalid: false,
    whereClause,
    orderByLowStock: key === "low_stock",
  };
}

function bulkRowToArray(row) {
  return [
    row["Stock No"] ?? row.stock_no ?? "",
    row["Item Description"] ?? row.product_name ?? "",
    row["Vendor Code"] ?? row.vendor_code ?? row.Vendor ?? row.vendor ?? "",
    row["Design Code"] ?? row.design_code ?? row.design ?? "",
    row["HSN Code"] ?? row.HSN ?? row.hsn_code ?? row.hsn ?? "",
    row["Retail Price"] ?? row.retail_price ?? "",
    row["Before Discount"] ?? row.before_discount ?? row.Discount ?? row.discount ?? "",
    row.GST ?? row["GST %"] ?? row.gst ?? "",
    row["Base UOM"] ?? row.base_uom ?? "",
    row["Closing Bal.Qty"] ?? row.closing_bal_qty ?? row.Quantity ?? row.quantity ?? "",
    row.Category ?? row.category ?? "",
    row["Sub Category"] ?? row.sub_category ?? "",
  ];
}

function buildBulkErrorWorkbook(failedRecords) {
  const exportData = [
    [...BULK_UPLOAD_HEADERS, "Error Reason"],
    ...failedRecords.map(({ row, error }) => [...bulkRowToArray(row), error]),
  ];
  const worksheet = xlsx.utils.aoa_to_sheet(exportData);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, "Failed Records");
  return xlsx.write(workbook, { bookType: "xlsx", type: "buffer" });
}

function sendBulkErrorExcel(res, { buffer, success, failed, savedFileName }) {
  res.setHeader("Content-Disposition", `attachment; filename=${savedFileName}`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("X-Bulk-Upload-Success", String(success));
  res.setHeader("X-Bulk-Upload-Failed", String(failed));
  res.setHeader(
    "Access-Control-Expose-Headers",
    "X-Bulk-Upload-Success, X-Bulk-Upload-Failed, Content-Disposition"
  );
  return res.send(buffer);
}

function isBlankExcelValue(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

function getBulkRowValue(row, ...keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  return undefined;
}

const BULK_MANDATORY_FIELDS = [
  { label: "Stock No", keys: ["Stock No", "stock_no"] },
  { label: "Item Description", keys: ["Item Description", "product_name"] },
  { label: "Vendor Code", keys: ["Vendor Code", "vendor_code", "Vendor", "vendor"] },
  { label: "Design Code", keys: ["Design Code", "design_code", "design"] },
  { label: "HSN Code", keys: ["HSN Code", "HSN", "hsn_code", "hsn"] },
  { label: "Retail Price", keys: ["Retail Price", "retail_price"] },
  { label: "Before Discount", keys: ["Before Discount", "before_discount", "Discount", "discount"] },
  { label: "GST", keys: ["GST", "GST %", "gst"] },
  { label: "Base UOM", keys: ["Base UOM", "base_uom"] },
  { label: "Closing Bal.Qty", keys: ["Closing Bal.Qty", "closing_bal_qty", "Quantity", "quantity"] },
  { label: "Category", keys: ["Category", "category"] },
  { label: "Sub Category", keys: ["Sub Category", "sub_category"] },
];

function collectBulkMandatoryErrors(row) {
  return BULK_MANDATORY_FIELDS.filter(({ keys }) =>
    isBlankExcelValue(getBulkRowValue(row, ...keys))
  ).map(({ label }) => `${label} is mandatory`);
}

function tryParseBulkNumericField(value, label, { integer = false } = {}) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return { error: `${label} must be a valid number` };
  }
  return { value: integer ? Math.trunc(num) : num };
}

function formatBulkRowErrors(errors) {
  return [...new Set(errors.filter(Boolean))].join("; ");
}

function parseBulkGstPercent(gstRaw) {
  const normalized = String(gstRaw).trim().replace(/%$/, "").trim();
  const tax = Number(normalized);
  if (!Number.isFinite(tax)) {
    return { error: `Invalid GST: ${gstRaw}` };
  }
  return { value: tax };
}

async function resolveBulkVendorIdOrError(vendorValue) {
  const trimmed = String(vendorValue).trim();
  const [[vendor]] = await db.query(
    `SELECT id FROM vendors WHERE status != 0 AND (vendor_code = ? OR vendor_name = ?) LIMIT 1`,
    { replacements: [trimmed, trimmed] }
  );
  if (!vendor) return { error: `Vendor Code not found: ${trimmed}` };
  return { id: vendor.id };
}

async function resolveBulkDesignIdOrError(designCode) {
  const trimmed = String(designCode).trim();
  const [[design]] = await db.query(
    `SELECT id FROM design_master WHERE design_code = ? AND status != 0 LIMIT 1`,
    { replacements: [trimmed] }
  );
  if (!design) return { error: `Design Code not found: ${trimmed}` };
  return { id: design.id };
}

async function resolveBulkGstIdOrError(gstRaw) {
  const parsed = parseBulkGstPercent(gstRaw);
  if (parsed.error) return { error: parsed.error };

  const tax = parsed.value;
  const [[gst]] = await db.query(
    `SELECT id FROM gst WHERE tax = ? AND status != 0 LIMIT 1`,
    { replacements: [tax] }
  );
  if (!gst) return { error: `GST rate not found: ${tax}%` };
  return { id: gst.id };
}

function collectBulkPositiveValueErrors(parsedNumbers) {
  const errors = [];
  const retailPrice = parsedNumbers["Retail Price"];
  const beforeDiscount = parsedNumbers["Before Discount"];
  const quantity = parsedNumbers["Closing Bal.Qty"];

  if (retailPrice !== undefined && retailPrice <= 0) {
    errors.push("Retail Price must be greater than zero");
  }
  if (beforeDiscount !== undefined && beforeDiscount <= 0) {
    errors.push("Before Discount must be greater than zero");
  }
  if (quantity !== undefined && quantity <= 0) {
    errors.push("Closing Bal.Qty must be greater than zero");
  }
  return errors;
}

async function validateBulkUploadRow(row, { seenStockNos, seenProductNames }) {
  const errors = collectBulkMandatoryErrors(row);

  const stockNoRaw = getBulkRowValue(row, "Stock No", "stock_no");
  const descRaw = getBulkRowValue(row, "Item Description", "product_name");
  const stockNo = isBlankExcelValue(stockNoRaw) ? "" : String(stockNoRaw).trim();
  const desc = isBlankExcelValue(descRaw) ? "" : String(descRaw).trim();

  if (stockNo) {
    if (seenStockNos.has(stockNo.toUpperCase())) {
      errors.push("Duplicate Stock No in upload file");
    }
    const [[existingStock]] = await db.query(`SELECT id FROM products WHERE stock_no = ?`, {
      replacements: [stockNo],
    });
    if (existingStock) errors.push("Stock no already exists");
  }

  if (desc) {
    if (seenProductNames.has(desc.toLowerCase())) {
      errors.push("Duplicate Item Description in upload file");
    }
    const [existingNames] = await db.query(`SELECT id FROM products WHERE product_name = ?`, {
      replacements: [desc],
    });
    if (existingNames.length) errors.push("Product name already exists");
  }

  const numericFields = [
    { value: getBulkRowValue(row, "Retail Price", "retail_price"), label: "Retail Price" },
    {
      value: getBulkRowValue(row, "Before Discount", "before_discount", "Discount", "discount"),
      label: "Before Discount",
    },
    {
      value: getBulkRowValue(row, "Closing Bal.Qty", "closing_bal_qty", "Quantity", "quantity"),
      label: "Closing Bal.Qty",
      integer: true,
    },
  ];

  const parsedNumbers = {};
  for (const field of numericFields) {
    if (isBlankExcelValue(field.value)) continue;
    const parsed = tryParseBulkNumericField(field.value, field.label, { integer: field.integer });
    if (parsed.error) errors.push(parsed.error);
    else parsedNumbers[field.label] = parsed.value;
  }

  errors.push(...collectBulkPositiveValueErrors(parsedNumbers));

  const vendorRaw = getBulkRowValue(row, "Vendor Code", "vendor_code", "Vendor", "vendor");
  const designRaw = getBulkRowValue(row, "Design Code", "design_code", "design");
  const gstRaw = getBulkRowValue(row, "GST", "GST %", "gst");
  const uomRaw = getBulkRowValue(row, "Base UOM", "base_uom");
  const categoryRaw = getBulkRowValue(row, "Category", "category");
  const subCategoryRaw = getBulkRowValue(row, "Sub Category", "sub_category");

  let vendorId;
  let designId;
  let gstId;
  let categoryId;

  if (!isBlankExcelValue(vendorRaw)) {
    const vendorResult = await resolveBulkVendorIdOrError(vendorRaw);
    if (vendorResult.error) errors.push(vendorResult.error);
    else vendorId = vendorResult.id;
  }

  if (!isBlankExcelValue(designRaw)) {
    const designResult = await resolveBulkDesignIdOrError(designRaw);
    if (designResult.error) errors.push(designResult.error);
    else designId = designResult.id;
  }

  if (!isBlankExcelValue(gstRaw)) {
    const gstResult = await resolveBulkGstIdOrError(gstRaw);
    if (gstResult.error) errors.push(gstResult.error);
    else gstId = gstResult.id;
  }

  const baseUom = isBlankExcelValue(uomRaw) ? "" : String(uomRaw).trim();

  if (!isBlankExcelValue(categoryRaw) || !isBlankExcelValue(subCategoryRaw)) {
    const categoryResult = await resolveBulkCategoryPairOrError(categoryRaw, subCategoryRaw);
    if (categoryResult.error) errors.push(categoryResult.error);
    else categoryId = categoryResult.categoryId;
  }

  const uniqueErrors = [...new Set(errors)];
  if (uniqueErrors.length) {
    return { errors: uniqueErrors, data: null };
  }

  const retailPrice = parsedNumbers["Retail Price"];
  const beforeDiscount = parsedNumbers["Before Discount"];
  const discount = Math.round((beforeDiscount - retailPrice) * 100) / 100;

  const discountError = validateDiscountAgainstPrice(discount, retailPrice);
  if (discountError) {
    return { errors: ["Discount cannot exceed Retail Price"], data: null };
  }

  return {
    errors: [],
    data: {
      stockNo,
      trimmedName: desc,
      price: retailPrice,
      discount,
      qty: parsedNumbers["Closing Bal.Qty"],
      lowThreshold: BULK_DEFAULT_LOW_STOCK_THRESHOLD,
      gstId,
      vendorId,
      designId,
      categoryId,
      baseUom,
      hsnCode: String(getBulkRowValue(row, "HSN Code", "HSN", "hsn_code", "hsn")).trim(),
    },
  };
}

export const upload = multer({ dest: uploadDir, limits: { fileSize: 10 * 1024 * 1024 } });
export const productImageUpload = multer({
  dest: productImageTmpDir,
  limits: { fileSize: 5 * 1024 * 1024 },
});

function buildQrData(product) {
  return String(product.stock_no ?? "").trim();
}

async function assertProductNameUnique(productName, excludeId = null) {
  const trimmed = String(productName ?? "").trim();
  if (!trimmed) {
    const err = new Error("product_name is required");
    err.statusCode = 400;
    throw err;
  }
  let sql = `SELECT id FROM products WHERE product_name = ?`;
  const params = [trimmed];
  if (excludeId != null && excludeId !== "") {
    sql += ` AND id != ?`;
    params.push(excludeId);
  }
  const [rows] = await db.query(sql, { replacements: params });
  if (rows.length) {
    const err = new Error("Product name already exists");
    err.statusCode = 409;
    throw err;
  }
  return trimmed;
}

async function generateQrForProduct(productId) {
  const [[p]] = await db.query(`SELECT * FROM products WHERE id = ?`, {
    replacements: [productId],
  });
  const qrData = buildQrData(p);
  await db.query(`UPDATE products SET qr_code_data = ? WHERE id = ?`, {
    replacements: [qrData, productId],
  });
  return qrData;
}

export const addProduct = async (req, res) => {
  try {
    await setSessionDefaults();
    const {
      stock_no, product_name, description, quantity, retail_price,
      discount = 0, gst_id, hsn_code, vendor_id, design_id, category_id, published = 1,
      low_stock_threshold,
    } = req.body;

    if (!stock_no?.trim()) return sendError(res, "stock_no is required");
    if (!product_name?.trim()) return sendError(res, "product_name is required");
    if (quantity === undefined || quantity === null || quantity === "") {
      return sendError(res, "quantity is required");
    }

    const pricing = validateProductPricingFields(
      { retail_price, discount, low_stock_threshold },
      { mode: "create" }
    );
    if (!pricing.ok) return sendError(res, pricing.errors[0]);

    const { retail_price: validatedPrice, discount: validatedDiscount, low_stock_threshold: threshold } =
      pricing.values;

    const catCheck = await validateProductCategoryId(category_id);
    if (!catCheck.ok) return sendError(res, catCheck.message);

    const trimmedName = await assertProductNameUnique(product_name);

    const [insertId] = await db.query(
      `INSERT INTO products (stock_no, product_name, description, quantity, low_stock_threshold, retail_price, discount, gst_id, hsn_code, vendor_id, design_id, category_id, published)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      {
        replacements: [
          stock_no.trim(), trimmedName, description ?? null, quantity || 0, threshold, validatedPrice,
          validatedDiscount, gst_id || null, hsn_code || null, vendor_id || null, design_id || null,
          catCheck.categoryId, published,
        ],
      }
    );
    const productId = Number(insertId);
    await generateQrForProduct(productId);
    await logInventoryChange({
      productId,
      staffId: req.user?.id,
      actionType: "increase",
      quantityChanged: quantity || 0,
      beforeQty: 0,
      afterQty: quantity || 0,
      referenceType: "product_create",
      referenceId: String(productId),
    });
    return sendSuccess(res, "Product created", { id: productId });
  } catch (error) {
    if (error.statusCode) return sendError(res, error.message, error.statusCode);
    return respondDbError(res, error, "Failed to create product");
  }
};

export const getStockNumbers = async (req, res) => {
  try {
    const { from_stockno, to_stockno, status } = req.query;
    const search = String(req.query.search ?? "").trim();
    const pagination = parseReportPagination(req.query, { defaultLimit: 50, maxLimit: 500 });

    let where = "WHERE p.status != 0";
    const params = [];

    if (status !== undefined && status !== null && String(status).trim() !== "") {
      where = "WHERE p.status = ?";
      params.push(Number(status));
    }

    where = appendStockNoRangeWhere(where, params, from_stockno, to_stockno);

    const { clause: searchClause, params: searchParams } = buildLikeSearch(
      ["p.stock_no"],
      search
    );
    where += searchClause;
    params.push(...searchParams);

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM products p ${where}`,
      { replacements: params }
    );

    let sql = `SELECT p.id, p.id AS product_id, p.stock_no
               FROM products p
               ${where}
               ORDER BY p.stock_no ASC`;
    const queryParams = [...params];

    if (pagination) {
      sql += ` LIMIT ? OFFSET ?`;
      queryParams.push(pagination.limit, pagination.offset);
    }

    const [rows] = await db.query(sql, { replacements: queryParams });

    const data = {
      rows,
      count: Number(total) || 0,
    };
    if (pagination) {
      data.page = pagination.page;
      data.limit = pagination.limit;
    }

    return sendSuccess(res, "Stock numbers fetched", data);
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const getProductStats = async (req, res) => {
  try {
    const [[row]] = await db.query(
      `SELECT COUNT(*) AS product,
              SUM(CASE WHEN p.quantity > 0 THEN 1 ELSE 0 END) AS instock,
              SUM(CASE WHEN p.published = 1 THEN 1 ELSE 0 END) AS published,
              SUM(CASE WHEN COALESCE(p.published, 0) = 0 THEN 1 ELSE 0 END) AS unpublished,
              SUM(CASE WHEN p.quantity <= p.low_stock_threshold THEN 1 ELSE 0 END) AS low_stock
       FROM products p WHERE p.status != 0`
    );
    return sendSuccess(res, "Product stats", {
      product: Number(row.product) || 0,
      instock: Number(row.instock) || 0,
      published: Number(row.published) || 0,
      unpublished: Number(row.unpublished) || 0,
      low_stock: Number(row.low_stock) || 0,
    });
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const getProducts = async (req, res) => {
  if (hasCrudId(req)) return getProductById(req, res);
  try {
    const {
      search,
      vendor_id,
      design_id,
      category_id,
      low_stock,
      in_stock,
      view_status,
      status,
      page = 1,
      limit = 20,
    } = req.query;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;

    const viewFilter = resolveViewStatusFilter(
      view_status,
      view_status === undefined ? status : undefined
    );

    if (viewFilter.invalid) {
      return sendSuccess(res, "Products fetched", {
        rows: [],
        page: pageNum,
        limit: limitNum,
        total: 0,
      });
    }

    let where = "WHERE p.status != 0";
    const params = [];

    if (viewFilter.applied) where += viewFilter.whereClause;

    if (search) {
      where += ` AND (p.stock_no LIKE ? OR p.product_name LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
    if (vendor_id) { where += ` AND p.vendor_id = ?`; params.push(vendor_id); }
    if (design_id) { where += ` AND p.design_id = ?`; params.push(design_id); }
    if (category_id) { where += ` AND p.category_id = ?`; params.push(category_id); }
    if (in_stock === "true") {
      where += ` AND p.quantity > 0`;
    }
    if (low_stock === "true") {
      where += ` AND p.quantity <= p.low_stock_threshold`;
    }

    const orderBy =
      low_stock === "true" || viewFilter.orderByLowStock ? "p.quantity ASC" : "p.id DESC";

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM products p ${where}`,
      { replacements: params }
    );

    const [products] = await db.query(
      `SELECT p.*, v.vendor_name, d.design_code, g.name AS gst_name, g.tax AS gst_tax,
              g.type AS gst_type,
              c.name AS category_name, c.parent_id AS category_parent_id,
              pc.name AS parent_category_name
       FROM products p
       LEFT JOIN vendors v ON v.id = p.vendor_id
       LEFT JOIN design_master d ON d.id = p.design_id
       LEFT JOIN gst g ON g.id = p.gst_id
       LEFT JOIN product_categories c ON c.id = p.category_id
       LEFT JOIN product_categories pc ON pc.id = c.parent_id
       ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      { replacements: [...params, parseInt(limit, 10), offset] }
    );
    const productsWithTotalPrice = await attachTotalPriceToProducts(products);
    const rows = await attachPrimaryImagesToProducts(productsWithTotalPrice);
    return sendSuccess(res, "Products fetched", {
      rows,
      page: pageNum,
      limit: limitNum,
      total: Number(total),
    });
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const getProductById = async (req, res) => {
  try {
    const [[p]] = await db.query(
      `SELECT p.*, v.vendor_name, d.design_code, g.name AS gst_name, g.tax AS gst_tax,
              g.type AS gst_type,
              c.name AS category_name, c.parent_id AS category_parent_id,
              pc.name AS parent_category_name
       FROM products p
       LEFT JOIN vendors v ON v.id = p.vendor_id
       LEFT JOIN design_master d ON d.id = p.design_id
       LEFT JOIN gst g ON g.id = p.gst_id
       LEFT JOIN product_categories c ON c.id = p.category_id
       LEFT JOIN product_categories pc ON pc.id = c.parent_id
       WHERE p.id = ? AND p.status != 0`,
      { replacements: [req.query.id] }
    );
    if (!p) return sendError(res, "Product not found", 404);
    const detail = await attachImagesToProductDetail(p);
    const productWithTotalPrice = await attachTotalPrice(detail);
    return sendSuccess(res, "Product detail", productWithTotalPrice);
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const uploadProductImage = async (req, res) => {
  try {
    if (!req.file) return sendError(res, "No image file uploaded");
    const saved = await saveProductImage(req.params.id, req.file, {
      imageSeq: parseInt(req.body?.imageseq, 10) || 1,
      isPrimary: req.body?.is_primary !== "0",
    });
    return sendSuccess(res, "Image uploaded", saved);
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const deleteProductImageHandler = async (req, res) => {
  try {
    const ok = await deleteProductImage(req.params.id, req.params.imageId);
    if (!ok) return sendError(res, "Image not found", 404);
    return sendSuccess(res, "Image deleted");
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const updateProduct = async (req, res) => {
  try {
    const productId = req.recordId ?? req.params.id;

    if (req.body.category_id !== undefined) {
      const catCheck = await validateProductCategoryId(req.body.category_id);
      if (!catCheck.ok) return sendError(res, catCheck.message);
      req.body.category_id = catCheck.categoryId;
    }

    if (req.body.product_name !== undefined) {
      req.body.product_name = await assertProductNameUnique(req.body.product_name, productId);
    }

    let quantityUpdate = null;
    if (req.body.quantity !== undefined) {
      const newQty = Number(req.body.quantity);
      if (!Number.isFinite(newQty) || newQty < 0) {
        return sendError(res, "quantity must be a non-negative number");
      }
      quantityUpdate = newQty;
    }

    const pricingFieldsTouched =
      req.body.retail_price !== undefined ||
      req.body.discount !== undefined ||
      req.body.low_stock_threshold !== undefined;

    let currentRetailPrice;
    let currentDiscount;
    if (pricingFieldsTouched && (req.body.retail_price === undefined || req.body.discount === undefined)) {
      const [[current]] = await db.query(
        `SELECT retail_price, discount FROM products WHERE id = ?`,
        { replacements: [productId] }
      );
      currentRetailPrice = Number(current?.retail_price);
      currentDiscount = Number(current?.discount ?? 0);
    }

    if (pricingFieldsTouched) {
      const pricing = validateProductPricingFields(req.body, {
        mode: "update",
        currentRetailPrice,
        currentDiscount,
      });
      if (!pricing.ok) return sendError(res, pricing.errors[0]);
      Object.assign(req.body, pricing.values);
      // Optional: blank low_stock_threshold must not overwrite with null/empty
      if (
        req.body.low_stock_threshold !== undefined &&
        !Object.prototype.hasOwnProperty.call(pricing.values, "low_stock_threshold")
      ) {
        delete req.body.low_stock_threshold;
      }
    }

    const fields = [
      "stock_no", "product_name", "description", "retail_price", "discount",
      "gst_id", "hsn_code", "vendor_id", "design_id", "category_id", "published", "status",
      "low_stock_threshold",
    ];
    const updates = [];
    const params = [];
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        params.push(req.body[f]);
      }
    }
    if (quantityUpdate !== null) {
      updates.push("quantity = ?");
      params.push(quantityUpdate);
    }
    if (!updates.length) return sendError(res, "No fields to update");

    let beforeQty = null;
    if (quantityUpdate !== null) {
      const [[p]] = await db.query(`SELECT quantity FROM products WHERE id = ?`, {
        replacements: [productId],
      });
      beforeQty = Number(p?.quantity ?? 0);
    }

    params.push(productId);
    await db.query(`UPDATE products SET ${updates.join(", ")} WHERE id = ?`, {
      replacements: params,
    });

    if (quantityUpdate !== null && beforeQty !== quantityUpdate) {
      await logInventoryChange({
        productId,
        staffId: req.user?.id,
        actionType: "adjustment",
        quantityChanged: Math.abs(quantityUpdate - beforeQty),
        beforeQty,
        afterQty: quantityUpdate,
        referenceType: "product_update",
        referenceId: String(productId),
      });
    }

    await generateQrForProduct(productId);
    return sendSuccess(res, "Product updated");
  } catch (error) {
    if (error.statusCode) return sendError(res, error.message, error.statusCode);
    return respondDbError(res, error, "Failed to update product");
  }
};

export const checkProductNameUnique = async (req, res) => {
  try {
    const { product_name, exclude_id } = req.body;
    if (!product_name?.trim()) return sendError(res, "product_name is required");
    await assertProductNameUnique(product_name, exclude_id ?? null);
    return sendSuccess(res, "Checked", { unique: true });
  } catch (error) {
    if (error.statusCode === 409) {
      return sendSuccess(res, "Checked", { unique: false });
    }
    return sendError(res, error.message, error.statusCode || 400);
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const ids = getRecordIds(req);
    const blockedIds = [];

    for (const productId of ids) {
      const [[{ txCount }]] = await db.query(
        `SELECT COUNT(*) AS txCount FROM transactions WHERE product_id = ?`,
        { replacements: [productId] }
      );
      if (Number(txCount) > 0) {
        blockedIds.push(productId);
      }
    }

    if (blockedIds.length) {
      return sendError(
        res,
        `Cannot delete product(s) linked to billing history: ${blockedIds.join(", ")}`,
        409
      );
    }

    for (const productId of ids) {
      await db.query(`DELETE FROM inventory_logs WHERE product_id = ?`, {
        replacements: [productId],
      });

      const imageDir = path.join(process.cwd(), "uploads", "products", String(productId));
      if (fs.existsSync(imageDir)) {
        fs.rmSync(imageDir, { recursive: true, force: true });
      }

      await db.query(`DELETE FROM products WHERE id = ?`, {
        replacements: [productId],
      });
    }

    return sendSuccess(res, deleteSuccessMessage(ids.length), deleteSuccessPayload(ids));
  } catch (error) {
    if (error?.original?.code === "ER_ROW_IS_REFERENCED_2") {
      return sendError(res, "Cannot delete product linked to other records", 409);
    }
    return respondDbError(res, error, "Failed to delete product");
  }
};

export const adjustStock = async (req, res) => {
  try {
    const { action, quantity, reason } = req.body;
    if (!["increase", "decrease"].includes(action)) return sendError(res, "Invalid action");
    const delta = action === "increase" ? Number(quantity) : -Number(quantity);
    const [[p]] = await db.query(`SELECT quantity FROM products WHERE id = ?`, {
      replacements: [req.params.id],
    });
    const beforeQty = p.quantity;
    const afterQty = beforeQty + delta;
    if (afterQty < 0) return sendError(res, "Insufficient stock");

    await db.query(`UPDATE products SET quantity = ? WHERE id = ?`, {
      replacements: [afterQty, req.params.id],
    });
    await logInventoryChange({
      productId: req.params.id,
      staffId: req.user?.id,
      actionType: "adjustment",
      quantityChanged: Math.abs(delta),
      beforeQty,
      afterQty,
      referenceType: "manual_adjust",
      referenceId: action,
      notes: reason,
    });
    return sendSuccess(res, "Stock adjusted", { quantity: afterQty });
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const getInventoryLogs = async (req, res) => {
  const [logs] = await db.query(
    `SELECT il.*, u.name AS staff_name FROM inventory_logs il
     LEFT JOIN users u ON u.id = il.staff_id
     WHERE il.product_id = ? ORDER BY il.createdon DESC`,
    { replacements: [req.crudId] }
  );
  return sendSuccess(res, "Inventory logs", { rows: logs });
};

export const getByStockNo = async (req, res) => {
  const [[p]] = await db.query(
    `SELECT p.*, g.tax, g.type AS gst_type FROM products p LEFT JOIN gst g ON g.id = p.gst_id
     WHERE p.stock_no = ? AND p.status = 1`,
    { replacements: [req.params.stockNo] }
  );
  if (!p) return sendError(res, "Product not found", 404);
  return sendSuccess(res, "Product", p);
};

async function findProductByQrInput(qrData) {
  const raw = typeof qrData === "string" ? qrData.trim() : qrData;
  if (!raw) return null;

  if (typeof raw === "string" && raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      const stockNo = parsed.stock_number ?? parsed.stock_no;
      if (stockNo) {
        const [[p]] = await db.query(`SELECT * FROM products WHERE stock_no = ? AND status = 1`, {
          replacements: [String(stockNo).trim()],
        });
        if (p) return p;
      }
      const id = parsed.id ?? parsed.product_id;
      if (id != null) {
        const [[p]] = await db.query(`SELECT * FROM products WHERE id = ? AND status = 1`, {
          replacements: [id],
        });
        return p ?? null;
      }
      return null;
    } catch {
      return null;
    }
  }

  const stockNo = typeof raw === "string" ? raw : null;
  if (!stockNo) return null;
  const [[p]] = await db.query(`SELECT * FROM products WHERE stock_no = ? AND status = 1`, {
    replacements: [stockNo],
  });
  return p ?? null;
}

export const qrScan = async (req, res) => {
  const { stock_no, qr_data } = req.body;
  let product = null;
  if (qr_data) {
    product = await findProductByQrInput(qr_data);
  } else if (stock_no) {
    product = await findProductByQrInput(stock_no);
  }
  if (!product) return sendError(res, "Product not found", 404);
  return sendSuccess(res, "QR scan result", product);
};

const QR_TAG_PRODUCT_SQL = `SELECT p.*, v.vendor_name, d.design_code, g.name AS gst_name, g.tax AS gst_tax,
                                   g.type AS gst_type,
                                   c.name AS category_name, c.parent_id AS category_parent_id,
                                   pc.name AS parent_category_name
                            FROM products p
                            LEFT JOIN vendors v ON v.id = p.vendor_id
                            LEFT JOIN design_master d ON d.id = p.design_id
                            LEFT JOIN gst g ON g.id = p.gst_id
                            LEFT JOIN product_categories c ON c.id = p.category_id
                            LEFT JOIN product_categories pc ON pc.id = c.parent_id`;

async function buildQrTagItem(product) {
  const data = buildQrData(product);
  if (product.qr_code_data !== data) {
    await db.query(`UPDATE products SET qr_code_data = ? WHERE id = ?`, {
      replacements: [data, product.id],
    });
  }
  const qrImage = await QRCode.toDataURL(data);
  const total_price = await resolveProductTotalPrice(product);
  return { qr_data: data, qr_image: qrImage, product: { ...product, total_price } };
}

export const getQrTag = async (req, res) => {
  try {
    if (hasCrudId(req)) {
      const [[p]] = await db.query(`${QR_TAG_PRODUCT_SQL} WHERE p.id = ? AND p.status != 0`, {
        replacements: [getCrudId(req)],
      });
      if (!p) return sendError(res, "Product not found", 404);
      return sendSuccess(res, "QR tag", await buildQrTagItem(p));
    }

    const { from_stockno, to_stockno, page, limit } = req.query;
    const hasPagination = page !== undefined || limit !== undefined;

    let where = "WHERE p.status != 0";
    const params = [];
    where = appendStockNoRangeWhere(where, params, from_stockno, to_stockno);

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM products p ${where}`,
      { replacements: params }
    );

    let sql = `${QR_TAG_PRODUCT_SQL} ${where} ORDER BY p.stock_no ASC`;

    const queryParams = [...params];
    let pagination = null;

    if (hasPagination) {
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10) || 20));
      sql += ` LIMIT ? OFFSET ?`;
      queryParams.push(limitNum, (pageNum - 1) * limitNum);
      pagination = { page: pageNum, limit: limitNum };
    }

    const [products] = await db.query(sql, { replacements: queryParams });
    const rows = await Promise.all(products.map((p) => buildQrTagItem(p)));

    return sendReportSuccess(
      res,
      "QR tags fetched",
      {
        rows,
        filters: {
          from_stockno: from_stockno?.trim() || null,
          to_stockno: to_stockno?.trim() || null,
        },
      },
      Number(total),
      pagination
    );
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const checkStatus = async (req, res) => {
  const { products } = req.body;
  if (!Array.isArray(products) || !products.length) {
    return sendError(res, "Products array is required");
  }
  const billedProducts = [];
  const missedProducts = [];
  for (const item of products) {
    const id = item.id || item.stock_no;
    const [[p]] = await db.query(
      `SELECT id, stock_no, quantity, product_name FROM products WHERE stock_no = ? OR id = ?`,
      { replacements: [id, id] }
    );
    if (!p || p.quantity < 1) missedProducts.push({ id, reason: !p ? "not found" : "out of stock" });
    else billedProducts.push(p);
  }
  if (missedProducts.length) {
    return res.status(200).json({
      status: false,
      message: "Cannot bill some items",
      billedProducts,
      missedProducts,
    });
  }
  return sendSuccess(res, "All items available", { billedProducts });
};

export const checkQuantity = async (req, res) => {
  const productId = req.body.id ?? req.body.product_id;
  const { quantity } = req.body;
  const [[p]] = await db.query(`SELECT quantity FROM products WHERE id = ?`, {
    replacements: [productId],
  });
  if (!p) return sendError(res, "Product not found", 404);
  return sendSuccess(res, "Quantity check", {
    available: p.quantity >= quantity,
    current_qty: p.quantity,
  });
};

export const bulkUpload = async (req, res) => {
  try {
    if (!req.file) return sendError(res, "Excel file required");
    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet);

    const failedRecords = [];
    let success = 0;
    const seenStockNos = new Set();
    const seenProductNames = new Set();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2;

      try {
        const { errors, data } = await validateBulkUploadRow(row, { seenStockNos, seenProductNames });

        if (errors.length) {
          failedRecords.push({ row, rowNumber, error: formatBulkRowErrors(errors) });
          continue;
        }

        const {
          stockNo,
          trimmedName,
          price,
          discount,
          qty,
          lowThreshold,
          gstId,
          vendorId,
          designId,
          categoryId,
          baseUom,
          hsnCode,
        } = data;

        const [pid] = await db.query(
          `INSERT INTO products (stock_no, product_name, quantity, low_stock_threshold, retail_price, discount, gst_id, vendor_id, design_id, hsn_code, category_id, base_uom, published)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)`,
          {
            replacements: [
              stockNo, trimmedName, qty, lowThreshold, price, discount, gstId, vendorId, designId, hsnCode,
              categoryId, baseUom,
            ],
          }
        );
        await generateQrForProduct(pid);
        await logInventoryChange({
          productId: pid,
          staffId: req.user?.id,
          actionType: "bulk_upload",
          quantityChanged: qty,
          beforeQty: 0,
          afterQty: qty,
          referenceType: "bulk_upload",
        });

        seenStockNos.add(stockNo.toUpperCase());
        seenProductNames.add(trimmedName.toLowerCase());
        success++;
      } catch (e) {
        failedRecords.push({
          row,
          rowNumber,
          error: getReadableDbErrorMessage(e, e.message || "Upload failed"),
        });
      }
    }

    fs.unlinkSync(req.file.path);

    if (failedRecords.length > 0) {
      const buffer = buildBulkErrorWorkbook(failedRecords);
      const savedFileName = `bulk_upload_errors_${Date.now()}.xlsx`;
      fs.writeFileSync(path.join(bulkErrorsDir, savedFileName), buffer);
      return sendBulkErrorExcel(res, {
        buffer,
        success,
        failed: failedRecords.length,
        savedFileName,
      });
    }

    return sendSuccess(res, "Bulk upload completed", { success, failed: 0 });
  } catch (error) {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return sendError(res, error.message, 500);
  }
};

export const downloadBulkTemplate = async (req, res) => {
  const ws = xlsx.utils.aoa_to_sheet([
    BULK_UPLOAD_HEADERS,
    ["PK003918", "Narayanpet", "PK", "9999", "5208", 1500, 1800, "5.00%", "Each", 2, "PK", "9999"],
    ["PK003919", "Kanchipuram Silk", "PK", "9999", "5007", 4500, 5000, "12.00%", "Each", 5, "PK", "9999"],
    ["PK003920", "Chettinad Cotton", "PK", "9999", "5208", 1800, 2000, "5.00%", "Each", 10, "PK", "9999"],
  ]);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "Products");
  const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", "attachment; filename=product_upload_template.xlsx");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  return res.send(buf);
};

export const getPosProducts = async (req, res) => {
  const [rows] = await db.query(
    `SELECT id, stock_no, product_name, quantity, retail_price, discount, gst_id
     FROM products WHERE status = 1 AND published = 1 AND quantity > 0 ORDER BY product_name`
  );
  return sendSuccess(res, "POS products", rows);
};
