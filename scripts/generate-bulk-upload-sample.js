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

const rows = [
  headers,
  ["PK003918", "Narayanpet", "PK", "9999", "5208", 1500, 1800, "5.00%", "Each", 2, "PK", "9999"],
  ["PK003919", "Kanchipuram Silk", "PK", "9999", "5007", 4500, 5000, "12.00%", "Each", 5, "PK", "9999"],
  ["PK003920", "Chettinad Cotton", "PK", "9999", "5208", 1800, 2000, "5.00%", "Each", 10, "PK", "9999"],
  ["PK003921", "Temple Border Silk", "PK", "9999", "5007", 6200, 6500, "12.00%", "Each", 8, "PK", "9999"],
  ["PK003922", "Handloom Linen", "PK", "9999", "5309", 3200, 3500, "5.00%", "Each", 15, "PK", "9999"],
];

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const ws = xlsx.utils.aoa_to_sheet(rows);
ws["!cols"] = [
  { wch: 14 },
  { wch: 24 },
  { wch: 12 },
  { wch: 12 },
  { wch: 10 },
  { wch: 12 },
  { wch: 14 },
  { wch: 10 },
  { wch: 10 },
  { wch: 14 },
  { wch: 12 },
  { wch: 14 },
];

const wb = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(wb, ws, "Products");
xlsx.writeFile(wb, outPath);

console.log("Written:", outPath);
