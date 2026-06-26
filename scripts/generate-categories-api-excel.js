/**
 * Generates Product Categories API Excel documentation.
 * Run: node scripts/generate-categories-api-excel.js
 */
import xlsx from "xlsx";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://localhost:8080/api/v1/categories";

const apiRows = [
  {
    "#": 1,
    Method: "GET",
    Path: "/categories",
    "Full URL": `${BASE}`,
    Permission: "category:read",
    "Query Params": "page, limit, search, parent_id, level=parent|sub, tree=true",
    "Path Params": "—",
    "Request Body": "—",
    "Success Response": `{ "status": true, "message": "Categories fetched", "data": { "rows": [...], "page", "limit", "total" } }`,
    "Error Response": `{ "status": false, "message": "..." }`,
    Notes: "Use tree=true for nested subcategories array",
  },
  {
    "#": 2,
    Method: "GET",
    Path: "/categories?tree=true",
    "Full URL": `${BASE}?tree=true`,
    Permission: "category:read",
    "Query Params": "tree=true",
    "Path Params": "—",
    "Request Body": "—",
    "Success Response": `{ "data": [{ "id", "name", "parent_id": null, "subcategories": [{ "id", "name", "parent_id" }] }] }`,
    "Error Response": `{ "status": false, "message": "..." }`,
    Notes: "Empty data [] if product_categories table has no rows",
  },
  {
    "#": 3,
    Method: "GET",
    Path: "/categories?level=parent",
    "Full URL": `${BASE}?level=parent`,
    Permission: "category:read",
    "Query Params": "level=parent, page, limit, search",
    "Path Params": "—",
    "Request Body": "—",
    "Success Response": "Paginated list; parent_id IS NULL only",
    "Error Response": `{ "status": false, "message": "..." }`,
    Notes: "Parent categories only",
  },
  {
    "#": 4,
    Method: "GET",
    Path: "/categories?level=sub",
    "Full URL": `${BASE}?level=sub`,
    Permission: "category:read",
    "Query Params": "level=sub, page, limit, search",
    "Path Params": "—",
    "Request Body": "—",
    "Success Response": "Paginated list; parent_id IS NOT NULL",
    "Error Response": `{ "status": false, "message": "..." }`,
    Notes: "All subcategories",
  },
  {
    "#": 5,
    Method: "GET",
    Path: "/categories?parent_id=1",
    "Full URL": `${BASE}?parent_id=1`,
    Permission: "category:read",
    "Query Params": "parent_id=<parent_id>, page, limit",
    "Path Params": "—",
    "Request Body": "—",
    "Success Response": "Subcategories under parent id 1",
    "Error Response": `{ "status": false, "message": "..." }`,
    Notes: "Use parent_id=null for parents (same as level=parent)",
  },
  {
    "#": 6,
    Method: "GET",
    Path: "/categories/:id",
    "Full URL": `${BASE}/:id`,
    Permission: "category:read",
    "Query Params": "—",
    "Path Params": "id",
    "Request Body": "—",
    "Success Response": `{ "data": { "id", "name", "parent_id", "status", "parent_name", "createdon", "updatedon" } }`,
    "Error Response": `{ "status": false, "message": "Category not found" } (404)`,
    Notes: "",
  },
  {
    "#": 7,
    Method: "POST",
    Path: "/categories",
    "Full URL": `${BASE}`,
    Permission: "category:create",
    "Query Params": "—",
    "Path Params": "—",
    "Request Body": `Parent: { "name": "Saree", "status": 1 }
Sub: { "name": "Silk Saree", "parent_id": 1, "status": 1 }`,
    "Success Response": `{ "status": true, "message": "Category created", "data": { "id": 1 } }`,
    "Error Response": "Duplicate name / invalid parent_id / name required",
    Notes: "Omit parent_id or null = parent category",
  },
  {
    "#": 8,
    Method: "PUT",
    Path: "/categories/:id",
    "Full URL": `${BASE}/:id`,
    Permission: "category:update",
    "Query Params": "—",
    "Path Params": "id",
    "Request Body": `{ "name": "Updated Name", "parent_id": 1, "status": 1 }`,
    "Success Response": `{ "status": true, "message": "Category updated" }`,
    "Error Response": "Not found / cannot be own parent / has subcategories",
    Notes: "Partial update — send only fields to change",
  },
  {
    "#": 9,
    Method: "DELETE",
    Path: "/categories/:id",
    "Full URL": `${BASE}/:id`,
    Permission: "category:delete",
    "Query Params": "—",
    "Path Params": "id",
    "Request Body": "—",
    "Success Response": `{ "status": true, "message": "Category deleted" }`,
    "Error Response": "Has subcategories / linked to products",
    Notes: "Soft delete (status=0)",
  },
  {
    "#": 10,
    Method: "GET",
    Path: "/categories/dropdown",
    "Full URL": `${BASE}/dropdown`,
    Permission: "category:read",
    "Query Params": "level=parent OR parent_id=<id>",
    "Path Params": "—",
    "Request Body": "—",
    "Success Response": `{ "data": [{ "id", "name", "parent_id" }] }`,
    "Error Response": `{ "status": false, "message": "..." }`,
    Notes: "UI: parents first, then subs when parent selected",
  },
  {
    "#": 11,
    Method: "POST",
    Path: "/categories/check-unique-name",
    "Full URL": `${BASE}/check-unique-name`,
    Permission: "category:read",
    "Query Params": "—",
    "Path Params": "—",
    "Request Body": `{ "name": "Silk", "parent_id": 1, "exclude_id": 2 }`,
    "Success Response": `{ "data": { "unique": true } }`,
    "Error Response": `{ "status": false, "message": "..." }`,
    Notes: "parent_id null for parent-level check",
  },
];

const modelRows = [
  { Field: "id", Type: "INT", Required: "Auto", Description: "Primary key" },
  { Field: "name", Type: "VARCHAR(150)", Required: "Yes", Description: "Category display name" },
  { Field: "parent_id", Type: "INT NULL", Required: "No", Description: "NULL = parent category; else FK to parent row id" },
  { Field: "status", Type: "TINYINT", Required: "Default 1", Description: "1=active, 0=soft deleted" },
  { Field: "createdon", Type: "DATETIME", Required: "Auto", Description: "Created timestamp" },
  { Field: "updatedon", Type: "DATETIME", Required: "Auto", Description: "Updated timestamp" },
];

const productLinkRows = [
  {
    Method: "POST",
    Endpoint: "/api/v1/products",
    Field: "category_id",
    Description: "Optional FK to product_categories.id (usually subcategory)",
  },
  {
    Method: "PUT",
    Endpoint: "/api/v1/products/:id",
    Field: "category_id",
    Description: "Update product category assignment",
  },
  {
    Method: "GET",
    Endpoint: "/api/v1/products",
    Field: "?category_id=",
    Description: "Filter products by category",
  },
  {
    Method: "GET",
    Endpoint: "/api/v1/products",
    Field: "response fields",
    Description: "category_name, category_parent_id, parent_category_name",
  },
];

const exampleRows = [
  {
    Scenario: "Create parent",
    Method: "POST",
    URL: `${BASE}`,
    Body: '{\n  "name": "Saree"\n}',
    "Expected data": '{ "id": 1 }',
  },
  {
    Scenario: "Create subcategory",
    Method: "POST",
    URL: `${BASE}`,
    Body: '{\n  "name": "Silk Saree",\n  "parent_id": 1\n}',
    "Expected data": '{ "id": 2 }',
  },
  {
    Scenario: "Category tree",
    Method: "GET",
    URL: `${BASE}?tree=true`,
    Body: "—",
    "Expected data": "Array of parents with subcategories[]",
  },
  {
    Scenario: "List subs for parent",
    Method: "GET",
    URL: `${BASE}?parent_id=1&page=1&limit=50`,
    Body: "—",
    "Expected data": "{ rows, page, limit, total }",
  },
  {
    Scenario: "Dropdown parents",
    Method: "GET",
    URL: `${BASE}/dropdown?level=parent`,
    Body: "—",
    "Expected data": "[{ id, name, parent_id: null }]",
  },
  {
    Scenario: "Dropdown subcategories",
    Method: "GET",
    URL: `${BASE}/dropdown?parent_id=1`,
    Body: "—",
    "Expected data": "[{ id, name, parent_id: 1 }]",
  },
  {
    Scenario: "Assign category to product",
    Method: "PUT",
    URL: "http://localhost:8080/api/v1/products/1",
    Body: '{\n  "category_id": 2\n}',
    "Expected data": "Product updated",
  },
];

const refRows = [
  { Item: "Base URL", Value: BASE },
  { Item: "Auth header", Value: "Authorization: Bearer <accessToken>" },
  { Item: "Permissions", Value: "category:create | category:read | category:update | category:delete" },
  { Item: "DB table", Value: "product_categories" },
  { Item: "Migration", Value: "npm run migrate:categories" },
  { Item: "Re-seed permissions", Value: "npm run seed (then sign in again)" },
  { Item: "Rule", Value: "Only one sub-level: subcategory cannot have children" },
  { Item: "vs products", Value: "Category tree reads product_categories NOT products table" },
  { Item: "vs gmaster", Value: "Separate from /gmaster and /gmastervalue general masters" },
];

const wb = xlsx.utils.book_new();
const ws1 = xlsx.utils.json_to_sheet(apiRows);
const ws2 = xlsx.utils.json_to_sheet(modelRows);
const ws3 = xlsx.utils.json_to_sheet(exampleRows);
const ws4 = xlsx.utils.json_to_sheet(productLinkRows);
const ws5 = xlsx.utils.json_to_sheet(refRows);

ws1["!cols"] = [
  { wch: 4 }, { wch: 8 }, { wch: 28 }, { wch: 45 }, { wch: 18 },
  { wch: 35 }, { wch: 12 }, { wch: 40 }, { wch: 55 }, { wch: 40 }, { wch: 35 },
];
ws2["!cols"] = [{ wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 50 }];
ws3["!cols"] = [{ wch: 22 }, { wch: 8 }, { wch: 50 }, { wch: 35 }, { wch: 35 }];
ws4["!cols"] = [{ wch: 8 }, { wch: 28 }, { wch: 14 }, { wch: 45 }];
ws5["!cols"] = [{ wch: 22 }, { wch: 70 }];

xlsx.utils.book_append_sheet(wb, ws1, "API List");
xlsx.utils.book_append_sheet(wb, ws2, "Data Model");
xlsx.utils.book_append_sheet(wb, ws3, "Examples");
xlsx.utils.book_append_sheet(wb, ws4, "Products Link");
xlsx.utils.book_append_sheet(wb, ws5, "Reference");

const outPath = path.join(__dirname, "..", "docs", "Product_Categories_API.xlsx");
xlsx.writeFile(wb, outPath);
console.log(`Written: ${outPath}`);
