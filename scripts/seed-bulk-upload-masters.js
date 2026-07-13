import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_DATABASE || "chettinad_thari",
});

async function ensureGmaster(name) {
  const [[existing]] = await conn.query(`SELECT id FROM gmaster WHERE name = ? LIMIT 1`, [name]);
  if (existing) return existing.id;
  const [result] = await conn.query(`INSERT INTO gmaster (name, status) VALUES (?, 1)`, [name]);
  return Number(result.insertId);
}

async function ensureGmastervalue(gmasterId, name) {
  const [[existing]] = await conn.query(
    `SELECT id FROM gmastervalue WHERE gmaster_id = ? AND name = ? LIMIT 1`,
    [gmasterId, name]
  );
  if (existing) return existing.id;
  const [result] = await conn.query(
    `INSERT INTO gmastervalue (gmaster_id, name, status) VALUES (?, ?, 1)`,
    [gmasterId, name]
  );
  return Number(result.insertId);
}

async function ensureVendor(code, name = code) {
  const [[existing]] = await conn.query(
    `SELECT id FROM vendors WHERE vendor_code = ? LIMIT 1`,
    [code]
  );
  if (existing) return existing.id;
  const [result] = await conn.query(
    `INSERT INTO vendors (vendor_code, vendor_name, status) VALUES (?, ?, 1)`,
    [code, name]
  );
  return Number(result.insertId);
}

async function ensureDesign(code) {
  const [[existing]] = await conn.query(
    `SELECT id FROM design_master WHERE design_code = ? LIMIT 1`,
    [code]
  );
  if (existing) return existing.id;
  const [result] = await conn.query(
    `INSERT INTO design_master (design_code, status) VALUES (?, 1)`,
    [code]
  );
  return Number(result.insertId);
}

async function ensureParentCategory(name) {
  const [[existing]] = await conn.query(
    `SELECT id FROM product_categories WHERE name = ? AND parent_id IS NULL AND status != 0 LIMIT 1`,
    [name]
  );
  if (existing) return existing.id;
  const [result] = await conn.query(
    `INSERT INTO product_categories (name, parent_id, status) VALUES (?, NULL, 1)`,
    [name]
  );
  return Number(result.insertId);
}

async function ensureSubCategory(name, parentId) {
  const [[existing]] = await conn.query(
    `SELECT id FROM product_categories WHERE name = ? AND parent_id = ? AND status != 0 LIMIT 1`,
    [name, parentId]
  );
  if (existing) return existing.id;
  const [result] = await conn.query(
    `INSERT INTO product_categories (name, parent_id, status) VALUES (?, ?, 1)`,
    [name, parentId]
  );
  return Number(result.insertId);
}

const uomMasterId = await ensureGmaster("Base UOM");
const uomId = await ensureGmastervalue(uomMasterId, "Each");
const vendorId = await ensureVendor("PK", "PK Vendor");
const designId = await ensureDesign("9999");
const categoryId = await ensureParentCategory("PK");
const subCategoryId = await ensureSubCategory("9999", categoryId);

console.log("Bulk upload master data ready:", {
  baseUom: { masterId: uomMasterId, eachId: uomId },
  vendorId,
  designId,
  categoryId,
  subCategoryId,
});

await conn.end();
