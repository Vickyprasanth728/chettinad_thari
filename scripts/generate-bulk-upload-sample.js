/**

 * Writes sample Excel for product bulk upload testing.

 * Run: node scripts/generate-bulk-upload-sample.js

 */

import fs from "fs";

import path from "path";

import { fileURLToPath } from "url";

import xlsx from "xlsx";



const __dirname = path.dirname(fileURLToPath(import.meta.url));

const outDir = path.join(__dirname, "..", "samples");

const outPath = path.join(outDir, "product_bulk_upload_sample.xlsx");



const headers = [

  "Stock No",

  "Item Description",

  "Retail Price",

  "Discount",

  "GST %",

  "Quantity",

  "Low Stock Threshold",

  "Vendor",

  "HSN",

  "Design Code",

];



const rows = [

  headers,

  ["STK-BULK-001", "Kanchipuram Silk Saree", 4500, 0, 5, 12, 5, "A1", "5007", "DES-001"],

  ["STK-BULK-002", "Chettinad Cotton Saree", 1800, 100, 5, 25, 5, "A1", "5208", "DES-001"],

  ["STK-BULK-003", "Temple Border Silk Saree", 6200, 0, 12, 8, 3, "A1", "5007", "DES-001"],

  ["STK-BULK-004", "Handloom Linen Saree", 3200, 50, 5, 15, 4, "A1", "5309", "DES-001"],

  ["STK-BULK-005", "Bridal Silk Saree", 12500, 0, 12, 5, 2, "A1", "5007", "DES-001"],

];



if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });



const ws = xlsx.utils.aoa_to_sheet(rows);

ws["!cols"] = [

  { wch: 14 },

  { wch: 28 },

  { wch: 12 },

  { wch: 10 },

  { wch: 8 },

  { wch: 10 },

  { wch: 18 },

  { wch: 16 },

  { wch: 8 },

  { wch: 12 },

];



const wb = xlsx.utils.book_new();

xlsx.utils.book_append_sheet(wb, ws, "Products");

xlsx.writeFile(wb, outPath);



console.log("Written:", outPath);


