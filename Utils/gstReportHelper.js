import dotenv from "dotenv";
import { validateGSTIN } from "./gstValidator.js";

dotenv.config();

export const B2C_LARGE_THRESHOLD = Number(process.env.B2C_LARGE_THRESHOLD) || 250000;
export const SELLER_STATE_CODE = String(process.env.SELLER_STATE_CODE || "33").padStart(2, "0").slice(0, 2);

const GSTIN_PATTERN = "^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$";

/** Line ratio for GST reporting — matches dashboard bill totals (includes returned lines on original sale). */
export const GST_EFFECTIVE_LINE_RATIO_SQL = `CASE
  WHEN t.id IS NULL THEN 0
  WHEN t.status = 0 THEN 0
  WHEN t.status = 2 THEN 1
  WHEN COALESCE(t.quantity, 0) > 0 THEN GREATEST(0, t.quantity - COALESCE(t.cancelled_qty, 0) - COALESCE(t.returned_qty, 0)) / t.quantity
  ELSE 0
END`;

export const GST_EFFECTIVE_QTY_SQL = `CASE
  WHEN t.id IS NULL THEN 0
  WHEN t.status = 0 THEN 0
  WHEN t.status = 2 THEN COALESCE(t.quantity, 0)
  WHEN COALESCE(t.quantity, 0) > 0 THEN GREATEST(0, t.quantity - COALESCE(t.cancelled_qty, 0) - COALESCE(t.returned_qty, 0))
  ELSE 0
END`;

export const GST_REPORTABLE_TX_JOIN = "t.bill_id = tb.id AND t.status != 0";

export const GST_STATE_NAMES = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "25": "Daman and Diu",
  "26": "Dadra and Nagar Haveli",
  "27": "Maharashtra",
  "28": "Andhra Pradesh",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
};

export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function formatReportDate(date) {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return String(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

export function formatRate(rate) {
  const n = round2(rate);
  if (!n) return "0%";
  return Number.isInteger(n) ? `${n}%` : `${n}%`;
}

export function getStateCodeFromGstin(gstin) {
  if (!gstin) return null;
  const cleaned = String(gstin).trim().toUpperCase();
  if (cleaned.length < 2) return null;
  return cleaned.slice(0, 2);
}

export function getStateName(stateCode) {
  if (!stateCode) return "Unknown";
  return GST_STATE_NAMES[String(stateCode).padStart(2, "0")] || "Unknown";
}

export function getPlaceOfSupply(customerGst) {
  const code = getStateCodeFromGstin(customerGst) || SELLER_STATE_CODE;
  return `${code}-${getStateName(code)}`;
}

export function isValidCustomerGstin(gstNumber) {
  if (!gstNumber || !String(gstNumber).trim()) return false;
  return validateGSTIN(gstNumber).valid;
}

export function isInterstateSale(customerGst, igstAmount) {
  if (Number(igstAmount) > 0) return true;
  const buyerState = getStateCodeFromGstin(customerGst);
  if (!buyerState) return false;
  return buyerState !== SELLER_STATE_CODE;
}

export function classifyGstGroup({ customerGst, invoiceTotal, igstAmount }) {
  if (isValidCustomerGstin(customerGst)) return "B2B";
  const interstate = isInterstateSale(customerGst, igstAmount);
  if (interstate && Number(invoiceTotal) >= B2C_LARGE_THRESHOLD) return "B2C Large";
  return "B2C Small";
}

export function normalizeGstReportQuery(query = {}) {
  const from = query.from || query.from_date || undefined;
  const to = query.to || query.to_date || undefined;
  const voucherType = (query.voucher_type || query.voucherType || "sale").toLowerCase();
  const gstType = (query.gst_type || query.gstType || "all").toLowerCase();
  const storeId = query.store_id || query.store || query.branch_id || query.branch || undefined;
  const format = query.format || "json";

  return { from, to, voucherType, gstType, storeId, format };
}

export function buildRetailGstWhere(filters, params) {
  let where = `WHERE tb.status = 'completed'`;

  const voucherType = filters.voucherType || "sale";
  if (voucherType === "sale" || voucherType === "return") {
    where += ` AND tb.bill_type = ?`;
    params.push(voucherType);
  } else if (voucherType !== "all") {
    where += ` AND tb.bill_type = 'sale'`;
  } else {
    where += ` AND tb.bill_type IN ('sale', 'return')`;
  }

  if (filters.from && filters.to) {
    where += ` AND DATE(tb.createdon) BETWEEN ? AND ?`;
    params.push(filters.from, filters.to);
  }

  if (filters.gstType === "b2b") {
    where += ` AND bc.gst_number IS NOT NULL AND bc.gst_number != '' AND UPPER(bc.gst_number) REGEXP ?`;
    params.push(GSTIN_PATTERN);
  } else if (filters.gstType === "b2c") {
    where += ` AND (bc.gst_number IS NULL OR bc.gst_number = '' OR UPPER(bc.gst_number) NOT REGEXP ?)`;
    params.push(GSTIN_PATTERN);
  }

  return where;
}

export function computeEffectiveRate(taxAmount, taxableAmount) {
  const taxable = Number(taxableAmount);
  const tax = Number(taxAmount);
  if (!taxable || taxable <= 0 || !tax) return 0;
  return round2((tax / taxable) * 100);
}

export function parseGstRates(raw) {
  if (raw == null || raw === "") return [];
  const values = String(raw)
    .split(",")
    .map((v) => round2(Number(v.trim())))
    .filter((v) => Number.isFinite(v));
  return [...new Set(values)].sort((a, b) => a - b);
}

/** Derive display rates from item tax configuration (not blended effective tax). */
export function resolveInvoiceGstRates(row) {
  const igst = round2(row.igst);
  const cgst = round2(row.cgst);
  const sgst = round2(row.sgst);
  const taxable = round2(row.taxable_amount);
  const configured = parseGstRates(row.gst_rates);

  if (igst > 0) {
    const fullRate = configured.filter((r) => r > 0).pop() ?? computeEffectiveRate(igst, taxable);
    return {
      igstRate: formatRate(fullRate),
      cgstRate: "0%",
      sgstRate: "0%",
    };
  }

  if (configured.length > 0) {
    const halfRates = configured.map((r) => formatRate(r / 2));
    return {
      igstRate: "0%",
      cgstRate: halfRates.join(", "),
      sgstRate: halfRates.join(", "),
    };
  }

  if (cgst > 0 || sgst > 0) {
    const half = computeEffectiveRate(cgst + sgst, taxable) / 2;
    return {
      igstRate: "0%",
      cgstRate: formatRate(half),
      sgstRate: formatRate(half),
    };
  }

  return { igstRate: "0%", cgstRate: "0%", sgstRate: "0%" };
}

export function buildSummaryRows(grouped, options = {}) {
  const { voucherType = null, includeGrandTotal = true, grandGroupLabel = "Grand Total" } = options;
  const order = ["B2B", "B2C Small", "B2C Large"];

  const withVoucher = (row) => (voucherType ? { "Voucher Type": voucherType, ...row } : row);

  const rows = order
    .filter((group) => grouped[group])
    .map((group) =>
      withVoucher({
        Group: group,
        "Count of Bills": grouped[group].count,
        "Net Amount": round2(grouped[group].netAmount),
        "Taxable Amount": round2(grouped[group].taxableAmount),
        "Total Tax Amount": round2(grouped[group].totalTax),
        "IGST Amount": round2(grouped[group].igst),
        "CGST Amount": round2(grouped[group].cgst),
        "SGST Amount": round2(grouped[group].sgst),
      })
    );

  const grand = rows.reduce(
    (acc, row) => ({
      count: acc.count + row["Count of Bills"],
      netAmount: acc.netAmount + row["Net Amount"],
      taxableAmount: acc.taxableAmount + row["Taxable Amount"],
      totalTax: acc.totalTax + row["Total Tax Amount"],
      igst: acc.igst + row["IGST Amount"],
      cgst: acc.cgst + row["CGST Amount"],
      sgst: acc.sgst + row["SGST Amount"],
    }),
    { count: 0, netAmount: 0, taxableAmount: 0, totalTax: 0, igst: 0, cgst: 0, sgst: 0 }
  );

  if (includeGrandTotal) {
    rows.push(
      withVoucher({
        Group: grandGroupLabel,
        "Count of Bills": grand.count,
        "Net Amount": round2(grand.netAmount),
        "Taxable Amount": round2(grand.taxableAmount),
        "Total Tax Amount": round2(grand.totalTax),
        "IGST Amount": round2(grand.igst),
        "CGST Amount": round2(grand.cgst),
        "SGST Amount": round2(grand.sgst),
      })
    );
  }

  return { rows, grand };
}

const EMPTY_SUMMARY_GRAND = Object.freeze({
  count: 0,
  netAmount: 0,
  taxableAmount: 0,
  totalTax: 0,
  igst: 0,
  cgst: 0,
  sgst: 0,
});

function subtractSummaryGrand(salesGrand, returnGrand) {
  return {
    count: salesGrand.count + returnGrand.count,
    netAmount: round2(salesGrand.netAmount - returnGrand.netAmount),
    taxableAmount: round2(salesGrand.taxableAmount - returnGrand.taxableAmount),
    totalTax: round2(salesGrand.totalTax - returnGrand.totalTax),
    igst: round2(salesGrand.igst - returnGrand.igst),
    cgst: round2(salesGrand.cgst - returnGrand.cgst),
    sgst: round2(salesGrand.sgst - returnGrand.sgst),
  };
}

function grandToSummaryRow(voucherType, grand, groupLabel = "Grand Total") {
  return {
    "Voucher Type": voucherType,
    Group: groupLabel,
    "Count of Bills": grand.count,
    "Net Amount": round2(grand.netAmount),
    "Taxable Amount": round2(grand.taxableAmount),
    "Total Tax Amount": round2(grand.totalTax),
    "IGST Amount": round2(grand.igst),
    "CGST Amount": round2(grand.cgst),
    "SGST Amount": round2(grand.sgst),
  };
}

export function formatGstSummaryTotals({ salesGrand, returnGrand, netGrand }) {
  return {
    sales_bill_count: salesGrand.count,
    return_bill_count: returnGrand.count,
    bill_count: netGrand.count,
    sales_amount: round2(salesGrand.netAmount),
    return_amount: round2(returnGrand.netAmount),
    net_amount: round2(netGrand.netAmount),
    sales_taxable_amount: round2(salesGrand.taxableAmount),
    return_taxable_amount: round2(returnGrand.taxableAmount),
    taxable_amount: round2(netGrand.taxableAmount),
    sales_tax_amount: round2(salesGrand.totalTax),
    return_tax_amount: round2(returnGrand.totalTax),
    total_tax: round2(netGrand.totalTax),
    igst: round2(netGrand.igst),
    cgst: round2(netGrand.cgst),
    sgst: round2(netGrand.sgst),
  };
}

/** Build GST summary rows + totals. Sales/returns are never merged into one gross total. */
export function buildGstSummaryReport(invoices, voucherType = "sale") {
  if (voucherType === "all") {
    const salesInvoices = invoices.filter((inv) => inv.bill_type === "sale");
    const returnInvoices = invoices.filter((inv) => inv.bill_type === "return");

    const salesGrouped = aggregateSummaryFromInvoices(salesInvoices);
    const returnGrouped = aggregateSummaryFromInvoices(returnInvoices);

    const { rows: salesRows, grand: salesGrand } = buildSummaryRows(salesGrouped, { voucherType: "Sales" });
    const { rows: returnRows, grand: returnGrand } = returnInvoices.length
      ? buildSummaryRows(returnGrouped, { voucherType: "Returns" })
      : { rows: [], grand: { ...EMPTY_SUMMARY_GRAND } };

    const netGrand = subtractSummaryGrand(salesGrand, returnGrand);
    const taxData = [...returnRows, grandToSummaryRow("Net", netGrand)];

    return {
      data: salesRows,
      tax_data: taxData,
      rows: [...salesRows, ...taxData],
      grand: netGrand,
      totals: formatGstSummaryTotals({ salesGrand, returnGrand, netGrand }),
    };
  }

  const grouped = aggregateSummaryFromInvoices(invoices);
  const sectionLabel = voucherType === "return" ? "Returns" : "Sales";
  const { rows, grand } = buildSummaryRows(grouped, { voucherType: sectionLabel });
  const salesGrand = voucherType === "return" ? { ...EMPTY_SUMMARY_GRAND } : grand;
  const returnGrand = voucherType === "return" ? grand : { ...EMPTY_SUMMARY_GRAND };
  const netGrand = voucherType === "return" ? subtractSummaryGrand(EMPTY_SUMMARY_GRAND, grand) : grand;

  return {
    data: voucherType === "return" ? [] : rows,
    tax_data: voucherType === "return" ? rows : [],
    rows,
    grand,
    totals: formatGstSummaryTotals({ salesGrand, returnGrand, netGrand }),
  };
}

function normalizeSummaryGrand(grand) {
  return {
    bill_count: grand.count ?? grand["Count of Bills"] ?? 0,
    net_amount: grand.netAmount ?? grand["Net Amount"] ?? 0,
    taxable_amount: grand.taxableAmount ?? grand["Taxable Amount"] ?? 0,
    total_tax: grand.totalTax ?? grand["Total Tax Amount"] ?? 0,
    igst: grand.igst ?? grand["IGST Amount"] ?? 0,
    cgst: grand.cgst ?? grand["CGST Amount"] ?? 0,
    sgst: grand.sgst ?? grand["SGST Amount"] ?? 0,
  };
}

function allocateProportionally(slabs, field, target) {
  const goal = round2(target);
  const sourceSum = round2(slabs.reduce((sum, row) => sum + Number(row[field] || 0), 0));

  if (!slabs.length) return [];
  if (sourceSum <= 0) {
    const even = round2(goal / slabs.length);
    return slabs.map((_, index) =>
      index === slabs.length - 1 ? round2(goal - even * (slabs.length - 1)) : even
    );
  }

  let allocated = 0;
  return slabs.map((slab, index) => {
    if (index === slabs.length - 1) return round2(goal - allocated);
    const value = round2((Number(slab[field] || 0) / sourceSum) * goal);
    allocated = round2(allocated + value);
    return value;
  });
}

function splitAllocatedTax(totalTax, slabs, sourceField) {
  const goal = round2(totalTax);
  const sourceSum = round2(slabs.reduce((sum, row) => sum + Number(row[sourceField] || 0), 0));
  if (sourceSum <= 0) {
    if (sourceField === "igst") return slabs.map(() => 0);
    const half = round2(goal / 2);
    return slabs.map((_, index) => (index === slabs.length - 1 ? round2(goal - half * (slabs.length - 1)) : half));
  }
  return allocateProportionally(slabs, sourceField, goal);
}

/** Scale slab rows per bill so sums match invoice header (credit, discount, returns). */
export function reconcileSlabRowsToInvoiceTotals(rows) {
  if (!rows.length) return rows;

  const byBill = new Map();
  for (const row of rows) {
    if (!byBill.has(row.bill_id)) byBill.set(row.bill_id, []);
    byBill.get(row.bill_id).push(row);
  }

  const reconciled = [];
  for (const slabs of byBill.values()) {
    const header = slabs[0];
    const targetNet = round2(header.invoice_net_amount);
    const targetTax = round2(targetNet <= 0 ? 0 : header.invoice_gst_total);
    const targetTaxable = round2(targetNet <= 0 ? 0 : targetNet - targetTax);

    const slabNetSum = round2(slabs.reduce((sum, row) => sum + Number(row.net_amount || 0), 0));

    if (targetNet <= 0) {
      for (const slab of slabs) {
        reconciled.push({
          ...slab,
          taxable_amount: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          total_tax: 0,
          net_amount: 0,
        });
      }
      continue;
    }

    if (slabNetSum <= 0 && targetNet > 0) {
      reconciled.push(buildHeaderOnlySlabRow(header));
      continue;
    }

    const nets = allocateProportionally(slabs, "net_amount", targetNet);
    const taxes = allocateProportionally(slabs, "total_tax", targetTax);
    const taxables = allocateProportionally(slabs, "taxable_amount", targetTaxable);
    const igsts = splitAllocatedTax(targetTax, slabs, "igst");
    const cgsts = splitAllocatedTax(targetTax, slabs, "cgst");
    const sgsts = splitAllocatedTax(targetTax, slabs, "sgst");

    slabs.forEach((slab, index) => {
      const totalTax = taxes[index];
      let igst = igsts[index];
      let cgst = cgsts[index];
      let sgst = sgsts[index];

      if (totalTax > 0 && round2(igst + cgst + sgst) !== totalTax) {
        if (igst > 0) {
          igst = totalTax;
          cgst = 0;
          sgst = 0;
        } else {
          cgst = round2(totalTax / 2);
          sgst = round2(totalTax - cgst);
          igst = 0;
        }
      }

      reconciled.push({
        ...slab,
        taxable_amount: taxables[index],
        total_tax: totalTax,
        net_amount: nets[index],
        igst,
        cgst,
        sgst,
      });
    });
  }

  return reconciled.sort(
    (a, b) =>
      new Date(a.invoice_date) - new Date(b.invoice_date) ||
      String(a.bill_no).localeCompare(String(b.bill_no)) ||
      Number(a.gst_rate) - Number(b.gst_rate)
  );
}

function buildHeaderOnlySlabRow(header) {
  const targetNet = round2(header.invoice_net_amount);
  const targetTax = round2(header.invoice_gst_total);
  const targetTaxable = round2(targetNet - targetTax);
  const half = round2(targetTax / 2);

  return {
    ...header,
    hsn_code: header.hsn_code || "N/A",
    gst_rate: 0,
    total_qty: 0,
    taxable_amount: targetTaxable,
    cgst: half,
    sgst: round2(targetTax - half),
    igst: 0,
    total_tax: targetTax,
    net_amount: targetNet,
  };
}

export function buildReconciliation(summaryGrand, detailedTotals, invoices = []) {
  const summary = normalizeSummaryGrand(summaryGrand);
  const fields = ["bill_count", "net_amount", "taxable_amount", "total_tax", "igst", "cgst", "sgst"];

  const comparison = {};
  let allMatch = true;

  for (const key of fields) {
    const summaryVal = round2(summary[key]);
    const detailVal = round2(detailedTotals[key] ?? 0);
    const match = summaryVal === detailVal;
    if (!match) allMatch = false;
    comparison[key] = { summary: summaryVal, detailed: detailVal, match };
  }

  const gstMath = {
    taxable_plus_tax_equals_net:
      round2(summary.taxable_amount + summary.total_tax) === round2(summary.net_amount),
    tax_components_equal_total_tax:
      round2(summary.igst + summary.cgst + summary.sgst) === round2(summary.total_tax),
  };

  const lineMismatches = invoices
    .map((inv) => inv.line_mismatch)
    .filter(Boolean);

  return {
    totals_match: allMatch,
    bill_counts_match: comparison.bill_count.match,
    gst_math_valid: gstMath.taxable_plus_tax_equals_net && gstMath.tax_components_equal_total_tax,
    gst_math: gstMath,
    line_item_mismatches: lineMismatches,
    comparison,
  };
}

export async function fetchInvoiceGstSlabRows(db, filters) {
  const params = [];
  const where = buildRetailGstWhere(filters, params);

  const [rows] = await db.query(
    `SELECT
        tb.id AS bill_id,
        tb.bill_no,
        tb.bill_type,
        tb.createdon AS invoice_date,
        tb.total AS invoice_net_amount,
        tb.gst_total AS invoice_gst_total,
        COALESCE(bc.name, 'Walk-in Customer') AS party_name,
        bc.gst_number AS customer_gst,
        COALESCE(NULLIF(p.hsn_code, ''), 'N/A') AS hsn_code,
        CASE
          WHEN COALESCE(t.gst_amount, 0) > 0 THEN COALESCE(g.tax, 0)
          ELSE 0
        END AS gst_rate,
        COALESCE(SUM(${GST_EFFECTIVE_QTY_SQL}), 0) AS total_qty,
        COALESCE(SUM(ROUND((t.line_total - t.gst_amount) * (${GST_EFFECTIVE_LINE_RATIO_SQL}), 2)), 0) AS taxable_amount,
        COALESCE(SUM(ROUND(t.cgst * (${GST_EFFECTIVE_LINE_RATIO_SQL}), 2)), 0) AS cgst,
        COALESCE(SUM(ROUND(t.sgst * (${GST_EFFECTIVE_LINE_RATIO_SQL}), 2)), 0) AS sgst,
        COALESCE(SUM(ROUND(t.igst * (${GST_EFFECTIVE_LINE_RATIO_SQL}), 2)), 0) AS igst,
        COALESCE(SUM(ROUND(t.gst_amount * (${GST_EFFECTIVE_LINE_RATIO_SQL}), 2)), 0) AS total_tax,
        COALESCE(SUM(ROUND(t.line_total * (${GST_EFFECTIVE_LINE_RATIO_SQL}), 2)), 0) AS slab_net_amount
     FROM transaction_billing tb
     LEFT JOIN billing_customers bc ON bc.id = tb.customer_id
     LEFT JOIN transactions t ON ${GST_REPORTABLE_TX_JOIN}
     LEFT JOIN products p ON p.id = t.product_id
     LEFT JOIN gst g ON g.id = COALESCE(t.gst_id, p.gst_id)
     ${where}
     GROUP BY
        tb.id, tb.bill_no, tb.bill_type, tb.createdon, tb.total, tb.gst_total,
        bc.name, bc.gst_number,
        COALESCE(NULLIF(p.hsn_code, ''), 'N/A'),
        CASE WHEN COALESCE(t.gst_amount, 0) > 0 THEN COALESCE(g.tax, 0) ELSE 0 END
     HAVING total_qty > 0 OR invoice_net_amount > 0
     ORDER BY tb.createdon, tb.bill_no, gst_rate`,
    { replacements: params }
  );

  const normalized = rows.map((row) => {
    const cgst = round2(row.cgst);
    const sgst = round2(row.sgst);
    let igst = round2(row.igst);
    const totalTax = round2(row.total_tax);
    const taxable = round2(row.taxable_amount);
    const net = round2(row.slab_net_amount);

    if (!cgst && !sgst && !igst && totalTax > 0) {
      const half = round2(totalTax / 2);
      return { ...row, taxable_amount: taxable, cgst: half, sgst: round2(totalTax - half), igst: 0, total_tax: totalTax, net_amount: net };
    }

    const taxSplit = round2(cgst + sgst + igst);
    if (totalTax > 0 && taxSplit !== totalTax && igst === 0) {
      const half = round2(totalTax / 2);
      return { ...row, taxable_amount: taxable, cgst: half, sgst: round2(totalTax - half), igst: 0, total_tax: totalTax, net_amount: net };
    }

    return { ...row, taxable_amount: taxable, cgst, sgst, igst, total_tax: totalTax, net_amount: net };
  });

  const reconciled = reconcileSlabRowsToInvoiceTotals(normalized);
  const coveredBillIds = new Set(reconciled.map((row) => row.bill_id));
  const headerOnlyRows = await fetchHeaderOnlySlabRows(db, filters, coveredBillIds);

  return [...reconciled, ...headerOnlyRows];
}

async function fetchHeaderOnlySlabRows(db, filters, coveredBillIds) {
  const params = [];
  const where = buildRetailGstWhere(filters, params);
  const excludeClause = coveredBillIds.size
    ? ` AND tb.id NOT IN (${[...coveredBillIds].map(() => "?").join(", ")})`
    : "";
  if (coveredBillIds.size) params.push(...coveredBillIds);

  const [rows] = await db.query(
    `SELECT
        tb.id AS bill_id,
        tb.bill_no,
        tb.bill_type,
        tb.createdon AS invoice_date,
        tb.total AS invoice_net_amount,
        tb.gst_total AS invoice_gst_total,
        COALESCE(bc.name, 'Walk-in Customer') AS party_name,
        bc.gst_number AS customer_gst
     FROM transaction_billing tb
     LEFT JOIN billing_customers bc ON bc.id = tb.customer_id
     ${where}${excludeClause}
       AND tb.total > 0
       AND NOT EXISTS (
         SELECT 1 FROM transactions t
         WHERE ${GST_REPORTABLE_TX_JOIN}
           AND (${GST_EFFECTIVE_QTY_SQL}) > 0
       )
     ORDER BY tb.createdon, tb.bill_no`,
    { replacements: params }
  );

  return rows.map(buildHeaderOnlySlabRow);
}

export function resolveSlabGstRates(gstRate, row) {
  const rate = round2(gstRate);
  const igst = round2(row.igst);

  if (igst > 0) {
    return {
      igstRate: formatRate(rate),
      cgstRate: "0%",
      sgstRate: "0%",
    };
  }

  if (rate > 0) {
    const half = formatRate(rate / 2);
    return { igstRate: "0%", cgstRate: half, sgstRate: half };
  }

  return { igstRate: "0%", cgstRate: "0%", sgstRate: "0%" };
}

export function mapDetailedSlabReportRow(row) {
  const igst = round2(row.igst);
  const cgst = round2(row.cgst);
  const sgst = round2(row.sgst);
  const taxable = round2(row.taxable_amount);
  const voucherType = row.bill_type === "return" ? "Return" : "Sales";
  const rates = resolveSlabGstRates(row.gst_rate, row);

  return {
    "Voucher Type": voucherType,
    "Invoice Date": formatReportDate(row.invoice_date),
    "Invoice Number": row.bill_no,
    "Party Name": row.party_name,
    "GSTIN/UIN": row.customer_gst || "",
    "Place of Supply": getPlaceOfSupply(row.customer_gst),
    "HSN Code": row.hsn_code,
    Qty: Number(row.total_qty) || 0,
    "Taxable Value": taxable,
    "IGST Rate": rates.igstRate,
    "IGST Amount": igst,
    "CGST Rate": rates.cgstRate,
    "CGST Amount": cgst,
    "SGST Rate": rates.sgstRate,
    "SGST Amount": sgst,
    "Invoice Value": round2(row.net_amount),
  };
}

export async function fetchInvoiceGstRows(db, filters) {
  const params = [];
  const where = buildRetailGstWhere(filters, params);

  const [rows] = await db.query(
    `SELECT
        tb.id AS bill_id,
        tb.bill_no,
        tb.bill_type,
        tb.createdon AS invoice_date,
        tb.total AS net_amount,
        (tb.total - tb.gst_total) AS taxable_amount,
        tb.gst_total AS total_tax,
        COALESCE(tb.cgst, 0) AS header_cgst,
        COALESCE(tb.sgst, 0) AS header_sgst,
        COALESCE(tb.igst, 0) AS header_igst,
        COALESCE(bc.name, 'Walk-in Customer') AS party_name,
        bc.gst_number AS customer_gst,
        COALESCE(SUM(${GST_EFFECTIVE_QTY_SQL}), 0) AS total_qty,
        COALESCE(SUM(ROUND((t.line_total - t.gst_amount) * (${GST_EFFECTIVE_LINE_RATIO_SQL}), 2)), 0) AS line_taxable,
        COALESCE(SUM(ROUND(t.cgst * (${GST_EFFECTIVE_LINE_RATIO_SQL}), 2)), 0) AS line_cgst,
        COALESCE(SUM(ROUND(t.sgst * (${GST_EFFECTIVE_LINE_RATIO_SQL}), 2)), 0) AS line_sgst,
        COALESCE(SUM(ROUND(t.igst * (${GST_EFFECTIVE_LINE_RATIO_SQL}), 2)), 0) AS line_igst,
        GROUP_CONCAT(DISTINCT NULLIF(p.hsn_code, '') ORDER BY p.hsn_code SEPARATOR ', ') AS hsn_codes,
        GROUP_CONCAT(DISTINCT
          CASE
            WHEN t.gst_amount > 0 THEN COALESCE(g.tax, 0)
            ELSE 0
          END
          ORDER BY 1 SEPARATOR ', ') AS gst_rates
     FROM transaction_billing tb
     LEFT JOIN billing_customers bc ON bc.id = tb.customer_id
     LEFT JOIN transactions t ON ${GST_REPORTABLE_TX_JOIN}
     LEFT JOIN products p ON p.id = t.product_id
     LEFT JOIN gst g ON g.id = COALESCE(t.gst_id, p.gst_id)
     ${where}
     GROUP BY tb.id, tb.bill_no, tb.bill_type, tb.createdon, tb.total, tb.gst_total,
              tb.cgst, tb.sgst, tb.igst, bc.name, bc.gst_number
     ORDER BY tb.createdon, tb.bill_no`,
    { replacements: params }
  );

  return rows.map(normalizeInvoiceTaxRow);
}

function hasHeaderTaxBreakdown(row) {
  return Number(row.header_cgst) > 0 || Number(row.header_sgst) > 0 || Number(row.header_igst) > 0;
}

export function normalizeInvoiceTaxRow(row) {
  const net = round2(row.net_amount);
  const totalTax = net <= 0 ? 0 : round2(row.total_tax);
  const taxable = net <= 0 ? 0 : round2(Math.max(0, net - totalTax));

  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  if (hasHeaderTaxBreakdown(row)) {
    cgst = round2(row.header_cgst);
    sgst = round2(row.header_sgst);
    igst = round2(row.header_igst);
  } else if (Number(row.line_cgst) || Number(row.line_sgst) || Number(row.line_igst)) {
    cgst = round2(row.line_cgst);
    sgst = round2(row.line_sgst);
    igst = round2(row.line_igst);
  } else if (totalTax > 0) {
    const half = round2(totalTax / 2);
    cgst = half;
    sgst = round2(totalTax - half);
    igst = 0;
  }

  const taxSplitTotal = round2(cgst + sgst + igst);
  if (totalTax > 0 && taxSplitTotal !== totalTax) {
    if (igst > 0) {
      cgst = 0;
      sgst = 0;
      igst = totalTax;
    } else {
      cgst = round2(totalTax / 2);
      sgst = round2(totalTax - cgst);
      igst = 0;
    }
  }

  const lineNet = round2(Number(row.line_taxable) + Number(row.line_cgst) + Number(row.line_sgst) + Number(row.line_igst));
  const lineMismatch =
    lineNet > 0 && Math.abs(lineNet - net) > 0.02
      ? {
          bill_no: row.bill_no,
          header_net: net,
          line_net: lineNet,
          difference: round2(net - lineNet),
        }
      : null;

  if (net <= 0) {
    return {
      ...row,
      taxable_amount: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      total_tax: 0,
      line_mismatch: null,
    };
  }

  return {
    ...row,
    taxable_amount: taxable,
    cgst,
    sgst,
    igst,
    total_tax: totalTax,
    line_mismatch: lineMismatch,
  };
}

export function mapDetailedReportRow(row) {
  const igst = round2(row.igst);
  const cgst = round2(row.cgst);
  const sgst = round2(row.sgst);
  const taxable = round2(row.taxable_amount);
  const voucherType = row.bill_type === "return" ? "Return" : "Sales";
  const rates = resolveInvoiceGstRates(row);

  return {
    "Voucher Type": voucherType,
    "Invoice Date": formatReportDate(row.invoice_date),
    "Invoice Number": row.bill_no,
    "Party Name": row.party_name,
    "GSTIN/UIN": row.customer_gst || "",
    "Place of Supply": getPlaceOfSupply(row.customer_gst),
    "HSN Code": row.hsn_codes || "N/A",
    Qty: Number(row.total_qty) || 0,
    "Taxable Value": taxable,
    "IGST Rate": rates.igstRate,
    "IGST Amount": igst,
    "CGST Rate": rates.cgstRate,
    "CGST Amount": cgst,
    "SGST Rate": rates.sgstRate,
    "SGST Amount": sgst,
    "Invoice Value": round2(row.net_amount),
  };
}

export function aggregateSummaryFromInvoices(invoices) {
  const grouped = {};

  for (const inv of invoices) {
    const group = classifyGstGroup({
      customerGst: inv.customer_gst,
      invoiceTotal: inv.net_amount,
      igstAmount: inv.igst,
    });

    if (!grouped[group]) {
      grouped[group] = {
        count: 0,
        netAmount: 0,
        taxableAmount: 0,
        totalTax: 0,
        igst: 0,
        cgst: 0,
        sgst: 0,
      };
    }

    grouped[group].count += 1;
    grouped[group].netAmount += Number(inv.net_amount);
    grouped[group].taxableAmount += Number(inv.taxable_amount);
    grouped[group].totalTax += Number(inv.total_tax);
    grouped[group].igst += Number(inv.igst);
    grouped[group].cgst += Number(inv.cgst);
    grouped[group].sgst += Number(inv.sgst);
  }

  return grouped;
}

export function aggregateDetailedTotals(invoices) {
  return invoices.reduce(
    (acc, inv) => ({
      bill_count: acc.bill_count + 1,
      net_amount: acc.net_amount + Number(inv.net_amount),
      taxable_amount: acc.taxable_amount + Number(inv.taxable_amount),
      total_tax: acc.total_tax + Number(inv.total_tax),
      igst: acc.igst + Number(inv.igst),
      cgst: acc.cgst + Number(inv.cgst),
      sgst: acc.sgst + Number(inv.sgst),
    }),
    { bill_count: 0, net_amount: 0, taxable_amount: 0, total_tax: 0, igst: 0, cgst: 0, sgst: 0 }
  );
}

function invoicesToSummaryGrand(invoices) {
  const totals = aggregateDetailedTotals(invoices);
  return {
    count: totals.bill_count,
    netAmount: totals.net_amount,
    taxableAmount: totals.taxable_amount,
    totalTax: totals.total_tax,
    igst: totals.igst,
    cgst: totals.cgst,
    sgst: totals.sgst,
  };
}

export function buildGstDetailedTotals(invoices, voucherType = "sale") {
  if (voucherType === "all") {
    const salesInvoices = invoices.filter((inv) => inv.bill_type === "sale");
    const returnInvoices = invoices.filter((inv) => inv.bill_type === "return");
    const salesGrand = invoicesToSummaryGrand(salesInvoices);
    const returnGrand = invoicesToSummaryGrand(returnInvoices);
    const netGrand = subtractSummaryGrand(salesGrand, returnGrand);
    return formatGstSummaryTotals({ salesGrand, returnGrand, netGrand });
  }

  const grand = invoicesToSummaryGrand(invoices);
  const salesGrand = voucherType === "return" ? { ...EMPTY_SUMMARY_GRAND } : grand;
  const returnGrand = voucherType === "return" ? grand : { ...EMPTY_SUMMARY_GRAND };
  const netGrand = voucherType === "return" ? subtractSummaryGrand(EMPTY_SUMMARY_GRAND, grand) : grand;
  return formatGstSummaryTotals({ salesGrand, returnGrand, netGrand });
}

export function buildGstDetailedReport(slabRows, invoices, voucherType = "sale", filters = {}) {
  const salesSlabs = slabRows.filter((row) => row.bill_type === "sale");
  const returnSlabs = slabRows.filter((row) => row.bill_type === "return");

  const data = salesSlabs.map(mapDetailedSlabReportRow);
  const tax_data = returnSlabs.map(mapDetailedSlabReportRow);
  const rows = [...data, ...tax_data];

  const salesInvoices = invoices.filter((inv) => inv.bill_type === "sale");
  const returnInvoices = invoices.filter((inv) => inv.bill_type === "return");

  const salesGrand = invoicesToSummaryGrand(salesInvoices);
  const returnGrand = invoicesToSummaryGrand(returnInvoices);
  const dataSlabTotals = aggregateSlabRowTotals(salesSlabs);
  const taxDataSlabTotals = aggregateSlabRowTotals(returnSlabs);

  const salesRows = voucherType === "return" ? [] : data;
  const returnRows = voucherType === "sale" ? [] : tax_data;

  const dataSection = buildDetailedSectionPayload(
    filters,
    salesRows,
    salesRows.length,
    salesInvoices.length,
    salesGrand,
    dataSlabTotals,
    "sales"
  );

  const taxDataSection =
    voucherType === "sale"
      ? emptyDetailedSectionPayload(filters)
      : buildDetailedSectionPayload(
          filters,
          returnRows,
          returnRows.length,
          returnInvoices.length,
          returnGrand,
          taxDataSlabTotals,
          "returns"
        );

  return {
    data: salesRows,
    tax_data: returnRows,
    rows,
    rowCount: rows.length,
    dataSection,
    taxDataSection,
  };
}

export function aggregateSlabRowTotals(rows) {
  return rows.reduce(
    (acc, row) => ({
      net_amount: acc.net_amount + Number(row.net_amount ?? row["Invoice Value"] ?? 0),
      taxable_amount: acc.taxable_amount + Number(row.taxable_amount ?? row["Taxable Value"] ?? 0),
      total_tax:
        acc.total_tax +
        Number(
          row.total_tax ??
            (Number(row["IGST Amount"] || 0) + Number(row["CGST Amount"] || 0) + Number(row["SGST Amount"] || 0))
        ),
      igst: acc.igst + Number(row.igst ?? row["IGST Amount"] ?? 0),
      cgst: acc.cgst + Number(row.cgst ?? row["CGST Amount"] ?? 0),
      sgst: acc.sgst + Number(row.sgst ?? row["SGST Amount"] ?? 0),
    }),
    { net_amount: 0, taxable_amount: 0, total_tax: 0, igst: 0, cgst: 0, sgst: 0 }
  );
}

export function formatGstReportTotals(totals) {
  return {
    bill_count: totals.bill_count ?? 0,
    sales_amount: round2(totals.sales_amount ?? totals.net_amount),
    return_amount: round2(totals.return_amount ?? 0),
    net_amount: round2(totals.net_amount),
    taxable_amount: round2(totals.taxable_amount),
    total_tax: round2(totals.total_tax),
    igst: round2(totals.igst),
    cgst: round2(totals.cgst),
    sgst: round2(totals.sgst),
  };
}

function formatGstReportFilters(filters) {
  return {
    from: filters.from || null,
    to: filters.to || null,
    voucher_type: filters.voucherType,
    gst_type: filters.gstType,
    store: filters.storeId || null,
  };
}

function grandToSectionReportTotals(grand, section = "sales") {
  const isReturn = section === "returns";
  return formatGstReportTotals({
    bill_count: grand.count,
    sales_amount: isReturn ? 0 : grand.netAmount,
    return_amount: isReturn ? grand.netAmount : 0,
    net_amount: grand.netAmount,
    taxable_amount: grand.taxableAmount,
    total_tax: grand.totalTax,
    igst: grand.igst,
    cgst: grand.cgst,
    sgst: grand.sgst,
  });
}

function slabTotalsToReportFormat(slabTotals, grand, billCount, section = "sales") {
  const isReturn = section === "returns";
  return {
    ...formatGstReportTotals({
      bill_count: billCount,
      sales_amount: isReturn ? 0 : slabTotals.net_amount,
      return_amount: isReturn ? slabTotals.net_amount : 0,
      net_amount: slabTotals.net_amount,
      taxable_amount: slabTotals.taxable_amount,
      total_tax: slabTotals.total_tax,
      igst: slabTotals.igst,
      cgst: slabTotals.cgst,
      sgst: slabTotals.sgst,
    }),
    matches_invoice_totals:
      round2(slabTotals.net_amount) === round2(grand.netAmount) &&
      round2(slabTotals.total_tax) === round2(grand.totalTax),
  };
}

export function buildDetailedSectionPayload(filters, rows, reportRowCount, invoiceCount, grand, slabTotals, section = "sales") {
  return {
    filters: formatGstReportFilters(filters),
    rows,
    report_rows: reportRowCount,
    invoice_count: invoiceCount,
    totals: grandToSectionReportTotals(grand, section),
    slab_totals: slabTotalsToReportFormat(slabTotals, grand, invoiceCount, section),
  };
}

function emptyDetailedSectionPayload(filters) {
  const emptyGrand = { ...EMPTY_SUMMARY_GRAND };
  return buildDetailedSectionPayload(filters, [], 0, 0, emptyGrand, aggregateSlabRowTotals([]), "returns");
}
