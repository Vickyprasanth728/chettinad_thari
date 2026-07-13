import fs from "fs";
import path from "path";
import { formatPaymentMethodsList } from "./paymentMethodHelper.js";

const BRAND_NAME = "CHETTINAD THARI";
const LOGO_RELATIVE_PATH = path.join("uploads", "logo", "chettinad-thari-logo.png");

/** Cached data-URI so every PDF render reuses one disk read. */
let cachedLogoDataUri = undefined;

function getLogoDataUri() {
  if (cachedLogoDataUri !== undefined) return cachedLogoDataUri;
  try {
    const logoPath = path.join(process.cwd(), LOGO_RELATIVE_PATH);
    if (!fs.existsSync(logoPath)) {
      cachedLogoDataUri = "";
      return cachedLogoDataUri;
    }
    const base64 = fs.readFileSync(logoPath).toString("base64");
    cachedLogoDataUri = `data:image/png;base64,${base64}`;
    return cachedLogoDataUri;
  } catch {
    cachedLogoDataUri = "";
    return cachedLogoDataUri;
  }
}

const BASE_STYLES = `
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", Arial, sans-serif;
    font-size: 11px;
    color: #1a1a1a;
    margin: 0;
    padding: 24px 28px;
  }
  .header {
    text-align: center;
    border-bottom: 2px solid #8b1e1e;
    padding-bottom: 14px;
    margin-bottom: 16px;
  }
  .header .logo {
    display: block;
    width: 72px;
    height: 72px;
    margin: 0 auto 10px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid #c9a227;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  }
  .brand {
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 1px;
    color: #8b1e1e;
    margin: 0 0 4px;
  }
  .report-title {
    font-size: 15px;
    font-weight: 600;
    margin: 0;
    color: #333;
  }
  .meta {
    margin: 0 0 14px;
    padding: 10px 12px;
    background: #f7f4f0;
    border-left: 4px solid #c9a227;
    font-size: 10px;
    line-height: 1.6;
  }
  .meta p { margin: 0; }
  table.data {
    width: 100%;
    border-collapse: collapse;
    margin-top: 4px;
  }
  table.data th {
    background: #8b1e1e;
    color: #fff;
    font-weight: 600;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    padding: 8px 6px;
    border: 1px solid #6d1818;
  }
  table.data td {
    padding: 7px 6px;
    border: 1px solid #ddd;
    vertical-align: top;
    word-break: break-word;
  }
  table.data tbody tr:nth-child(even) { background: #fafafa; }
  table.data tfoot td {
    font-weight: 700;
    background: #f0ebe3;
    border-top: 2px solid #8b1e1e;
  }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .empty {
    text-align: center;
    padding: 24px;
    color: #666;
    font-style: italic;
  }
  .footer-note {
    margin-top: 16px;
    font-size: 9px;
    color: #888;
    text-align: center;
  }
  .invoice-meta { margin: 12px 0; line-height: 1.7; }
  .invoice-meta span { display: inline-block; min-width: 140px; }
  .totals-box {
    margin-top: 12px;
    margin-left: auto;
    width: 320px;
    padding: 10px 12px;
    background: #f7f4f0;
    border: 1px solid #ddd;
  }
  .totals-box .row {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    line-height: 1.8;
    font-size: 11px;
  }
  .totals-box .row .label { color: #444; }
  .totals-box .row .value { font-variant-numeric: tabular-nums; text-align: right; }
  .totals-box .row.muted .label,
  .totals-box .row.muted .value { color: #666; }
  .totals-box .divider {
    border: 0;
    border-top: 1px solid #ccc;
    margin: 6px 0;
  }
  .grand-total {
    font-size: 13px;
    font-weight: 700;
    color: #8b1e1e;
    margin-top: 2px;
  }
  table.data.invoice-lines th,
  table.data.invoice-lines td {
    padding: 6px 4px;
    font-size: 9.5px;
  }
  .signature-wrap {
    margin-top: 48px;
    display: flex;
    justify-content: flex-end;
    page-break-inside: avoid;
  }
  .signature-box {
    width: 240px;
    min-height: 90px;
    border: 1px solid #333;
    padding: 14px 16px;
    font-size: 11px;
    line-height: 2;
  }
  .signature-box .label {
    font-weight: 600;
    color: #333;
  }
  .signature-line {
    border-bottom: 1px solid #666;
    min-height: 18px;
    margin-top: 4px;
  }
`;

/** @param {string} reportKey filename key e.g. vendor_report */
const REPORT_CONFIG = {
  vendor_report: {
    title: "Vendor Report",
    columns: [
      { key: "id", label: "ID" },
      { key: "vendor_name", label: "Vendor Name" },
      { key: "total_purchase", label: "Total Purchase", align: "right", format: "currency" },
      { key: "paid_amount", label: "Paid Amount", align: "right", format: "currency" },
      { key: "pending_amount", label: "Pending Amount", align: "right", format: "currency" },
    ],
    totalKeys: ["total_purchase", "paid_amount", "pending_amount"],
  },
  in_depth_report: {
    title: "In-Depth Sales Report",
    columns: [
      { key: "s_no", label: "S.No", align: "center" },
      { key: "date", label: "Date", format: "date" },
      { key: "bill_no", label: "Bill No" },
      { key: "product_name", label: "Product Name" },
      { key: "staff", label: "Staff" },
      { key: "payment_type", label: "Payment Type" },
      { key: "quantity", label: "Qty", align: "right" },
      { key: "unit_price", label: "Unit Price", align: "right", format: "currency" },
      { key: "discount", label: "Discount", align: "right", format: "currency" },
      { key: "gst_rate", label: "GST %", align: "right" },
      { key: "gst_amount", label: "GST Amount", align: "right", format: "currency" },
      { key: "line_total", label: "Total Price", align: "right", format: "currency" },
    ],
    totalKeys: ["gst_amount", "line_total"],
  },
  bill_details_report: {
    title: "Bill Details Report",
    columns: [
      { key: "id", label: "ID" },
      { key: "date", label: "Date", format: "date" },
      { key: "bill_no", label: "Bill No" },
      { key: "bill_amount", label: "Bill Amount", align: "right", format: "currency" },
      { key: "payment_type", label: "Payment Type", format: "payment" },
    ],
    totalKeys: ["bill_amount"],
  },
  cancelled_bills: {
    title: "Cancelled Bills Report",
    columns: [
      { key: "id", label: "ID" },
      { key: "date", label: "Date", format: "date" },
      { key: "bill_no", label: "Bill No" },
      { key: "cancel_type", label: "Cancel Type" },
      { key: "bill_amount", label: "Cancelled Amount", align: "right", format: "currency" },
      { key: "items_billed", label: "Cancelled Items" },
      { key: "customer", label: "Customer" },
      { key: "payment_type", label: "Payment Type", format: "payment" },
      { key: "staff", label: "Staff" },
      { key: "cancellation_reason", label: "Cancellation Reason" },
    ],
    totalKeys: ["bill_amount"],
  },
  daily_report: {
    title: "Daily Report",
    columns: [
      { key: "s_no", label: "S.No", align: "center" },
      { key: "bill_no", label: "Bill No" },
      { key: "stock_no", label: "Stock No" },
      { key: "staff_name", label: "Staff Name" },
      { key: "cancelled_bill_history", label: "Cancelled Bill History" },
      { key: "payment_type_name", label: "Payment Type", format: "payment" },
      { key: "payment_amounts", label: "Payment Amounts" },
    ],
  },
};

export function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Shared letterhead used by all PDF builders. */
function buildPdfHeaderHtml(reportTitle) {
  const logoUri = getLogoDataUri();
  const logoHtml = logoUri
    ? `<img class="logo" src="${logoUri}" alt="${escapeHtml(BRAND_NAME)}" />`
    : "";
  return `<div class="header">
    ${logoHtml}
    <p class="brand">${BRAND_NAME}</p>
    <p class="report-title">${escapeHtml(reportTitle)}</p>
  </div>`;
}

function formatColumnLabel(key) {
  return String(key)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCellValue(value, format) {
  if (value === null || value === undefined || value === "") return "";
  if (format === "currency") {
    const n = Number(value);
    if (!Number.isFinite(n)) return escapeHtml(value);
    return escapeHtml(
      n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    );
  }
  if (format === "date") {
    const s = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
    return escapeHtml(s);
  }
  if (format === "payment") {
    return escapeHtml(formatPaymentMethodsList(value));
  }
  return escapeHtml(value);
}

function sumColumn(rows, key) {
  return rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
}

function buildMetaHtml(metaLines = []) {
  if (!metaLines.length) return "";
  return `<div class="meta">${metaLines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}</div>`;
}

function resolveColumns(rows, explicitColumns) {
  if (explicitColumns?.length) return explicitColumns;
  if (!rows.length) return [];
  return Object.keys(rows[0]).map((key) => ({
    key,
    label: key.includes("_") ? formatColumnLabel(key) : key,
    align: typeof rows[0][key] === "number" ? "right" : "left",
    format: typeof rows[0][key] === "number" ? "currency" : undefined,
  }));
}

export function buildReportMetaLines({ from, to, extra = [] } = {}) {
  const lines = [];
  if (from || to) {
    lines.push(`Period: ${from || "—"} to ${to || "—"}`);
  }
  lines.push(
    `Generated: ${new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    })}`
  );
  return [...lines, ...extra];
}

/**
 * Build HTML for tabular reports (admin reports, GST exports).
 */
export function buildTabularReportHtml({
  title,
  rows = [],
  columns,
  metaLines = [],
  totalKeys = [],
  landscape = false,
  includeFooterNote = true,
}) {
  const cols = resolveColumns(rows, columns);
  const reportTitle = title || "Report";

  let tableBody = "";
  if (!rows.length) {
    tableBody = `<tr><td colspan="${cols.length || 1}" class="empty">No records found for the selected filters.</td></tr>`;
  } else {
    tableBody = rows
      .map(
        (row) =>
          `<tr>${cols
            .map((col) => {
              const align = col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "";
              const raw = row[col.key];
              return `<td class="${align}">${formatCellValue(raw, col.format)}</td>`;
            })
            .join("")}</tr>`
      )
      .join("");
  }

  const headerRow = cols.length
    ? `<tr>${cols.map((col) => `<th class="${col.align === "right" ? "text-right" : ""}">${escapeHtml(col.label)}</th>`).join("")}</tr>`
    : "";

  let footerRow = "";
  const totals = totalKeys.filter((key) => cols.some((c) => c.key === key));
  if (totals.length && rows.length) {
    footerRow = `<tfoot><tr>${cols
      .map((col, idx) => {
        if (totals.includes(col.key)) {
          const sum = sumColumn(rows, col.key);
          return `<td class="text-right">${formatCellValue(sum, col.format || "currency")}</td>`;
        }
        return `<td>${idx === 0 ? "<strong>Total</strong>" : ""}</td>`;
      })
      .join("")}</tr></tfoot>`;
  }

  const pageStyle = landscape ? `@page { size: A4 landscape; margin: 12mm; }` : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${pageStyle}${BASE_STYLES}</style>
</head>
<body>
  ${buildPdfHeaderHtml(reportTitle)}
  ${buildMetaHtml(metaLines)}
  <table class="data">
    <thead>${headerRow}</thead>
    <tbody>${tableBody}</tbody>
    ${footerRow}
  </table>
  ${includeFooterNote ? `<p class="footer-note">This is a computer-generated report from ${BRAND_NAME}.</p>` : ""}
</body>
</html>`;
}

function buildSignatureBlockHtml(signatureDate) {
  const dateLabel = signatureDate || "_______________";
  return `<div class="signature-wrap">
    <div class="signature-box">
      <div><span class="label">Date:</span></div>
      <div class="signature-line">${escapeHtml(dateLabel)}</div>
      <div style="margin-top:12px"><span class="label">Staff Signature:</span></div>
      <div class="signature-line">&nbsp;</div>
    </div>
  </div>`;
}

/** Admin report PDF by report filename key. */
export function buildAdminReportPdfHtml(reportKey, rows, options = {}) {
  const config = REPORT_CONFIG[reportKey] || {
    title: formatColumnLabel(reportKey),
    totalKeys: [],
  };
  const metaLines = buildReportMetaLines({
    from: options.from,
    to: options.to,
    extra: options.extraMeta || [],
  });
  const tableHtml = buildTabularReportHtml({
    title: options.title || config.title,
    rows,
    columns: config.columns,
    totalKeys: config.totalKeys || [],
    metaLines,
    landscape: options.landscape ?? reportKey === "in_depth_report",
    includeFooterNote: reportKey !== "daily_report",
  });

  if (reportKey !== "daily_report") {
    return tableHtml;
  }

  const signatureDate =
    options.signatureDate ||
    (options.from && options.to && options.from === options.to
      ? options.from
      : options.to || options.from || "");
  const signatureHtml = buildSignatureBlockHtml(signatureDate);
  return tableHtml.replace("</body>", `${signatureHtml}</body>`);
}

function money(value) {
  return formatCellValue(value, "currency");
}

function totalsRow(label, value, className = "") {
  return `<div class="row ${className}"><span class="label">${escapeHtml(label)}</span><span class="value">${money(value)}</span></div>`;
}

export function buildInvoicePdfHtml(bill, items, payments) {
  const itemRows = items
    .map((i) => {
      const qty = Number(i.quantity) || 0;
      const unitPrice = Number(i.unit_price) || 0;
      const gstAmount = Number(i.gst_amount) || 0;
      const lineTotal = Number(i.line_total) || 0;
      const amount = Math.round(qty * unitPrice * 100) / 100;

      return `<tr>
          <td>${escapeHtml(i.product_name)}</td>
          <td>${escapeHtml(i.stock_no)}</td>
          <td class="text-center">${escapeHtml(i.quantity)}</td>
          <td class="text-right">${money(unitPrice)}</td>
          <td class="text-right">${money(amount)}</td>
          <td class="text-right">${money(gstAmount)}</td>
          <td class="text-right">${money(lineTotal)}</td>
        </tr>`;
    })
    .join("");

  const payRows = payments
    .map(
      (p) =>
        `<tr>
          <td>${escapeHtml(p.payment_method)}</td>
          <td class="text-right">${money(p.amount)}</td>
        </tr>`
    )
    .join("");

  const billDate = bill.createdon instanceof Date
    ? bill.createdon.toISOString().slice(0, 19).replace("T", " ")
    : String(bill.createdon || "");

  const itemsAmount = Math.round(
    items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0) * 100
  ) / 100;
  const discountTotal = Number(bill.discount) || 0;
  const creditApplied = Number(bill.credit_applied) || 0;
  const paidTotal = (payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const igst = Number(bill.igst) || 0;

  const totalsHtml = [
    totalsRow("Items Amount", itemsAmount),
    discountTotal > 0 ? totalsRow("Less: Discount", discountTotal) : "",
    `<hr class="divider" />`,
    totalsRow("Taxable Value", bill.subtotal),
    totalsRow("CGST", bill.cgst, "muted"),
    totalsRow("SGST", bill.sgst, "muted"),
    igst > 0 ? totalsRow("IGST", igst, "muted") : "",
    totalsRow("GST Total", bill.gst_total),
    `<hr class="divider" />`,
    totalsRow("Grand Total", bill.total, "grand-total"),
    creditApplied > 0 ? totalsRow("Credit Applied", creditApplied) : "",
    creditApplied > 0
      ? totalsRow("Amount Payable", Math.max(0, Number(bill.total) - creditApplied), "grand-total")
      : "",
    payments?.length ? totalsRow("Amount Paid", paidTotal) : "",
  ]
    .filter(Boolean)
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${BASE_STYLES}</style>
</head>
<body>
  ${buildPdfHeaderHtml("Tax Invoice")}
  <div class="invoice-meta">
    <p><span><strong>Bill No:</strong></span> ${escapeHtml(bill.bill_no)}</p>
    <p><span><strong>Date:</strong></span> ${escapeHtml(billDate)}</p>
    <p><span><strong>Staff:</strong></span> ${escapeHtml(bill.staff_name || "—")}</p>
    <p><span><strong>Order No:</strong></span> ${escapeHtml(bill.manual_order_number || "—")}</p>
    <p><span><strong>Customer:</strong></span> ${escapeHtml(bill.customer_name || "Walk-in")}</p>
    <p><span><strong>Mobile:</strong></span> ${escapeHtml(bill.mobile || "—")} &nbsp;
       <strong>GSTIN:</strong> ${escapeHtml(bill.customer_gst || "—")}</p>
  </div>
  <table class="data invoice-lines">
    <thead>
      <tr>
        <th>Product</th>
        <th>Stock No</th>
        <th class="text-center">Qty</th>
        <th class="text-right">Unit Price</th>
        <th class="text-right">Amount</th>
        <th class="text-right">GST</th>
        <th class="text-right">Total</th>
      </tr>
    </thead>
    <tbody>${itemRows || `<tr><td colspan="7" class="empty">No line items</td></tr>`}</tbody>
  </table>
  <div class="totals-box">${totalsHtml}</div>
  <p class="report-title" style="margin-top:16px">Payments</p>
  <table class="data">
    <thead><tr><th>Method</th><th class="text-right">Amount</th></tr></thead>
    <tbody>${payRows || `<tr><td colspan="2" class="empty">No payments recorded</td></tr>`}</tbody>
  </table>
  <p class="footer-note">Thank you for shopping with ${BRAND_NAME}.</p>
</body>
</html>`;
}
