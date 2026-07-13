import xlsx from "xlsx";
import { htmlToPdfBuffer, sendPdf } from "../../../Utils/pdfHelper.js";
import { buildTabularReportHtml, buildReportMetaLines } from "../../../Utils/pdfReportHtml.js";
import { db, setSessionDefaults } from "../../../config/Database.js";
import { sendReportSuccess, sendError } from "../../../Utils/response.js";
import {
  parseReportPagination,
  slicePaginated,
  isJsonReportFormat,
} from "../../../Utils/listQuery.js";
import {
  normalizeGstReportQuery,
  fetchInvoiceGstRows,
  fetchInvoiceGstSlabRows,
  buildGstSummaryReport,
  buildGstDetailedReport,
  buildReconciliation,
  aggregateDetailedTotals,
  round2,
} from "../../../Utils/gstReportHelper.js";

function dateFilter(from, to, params) {
  let clause = "";
  if (from && to) {
    clause = " AND DATE(tb.createdon) BETWEEN ? AND ?";
    params.push(from, to);
  }
  return clause;
}

export const gstSummaryReport = async (req, res) => {
  try {
    await setSessionDefaults();
    const filters = normalizeGstReportQuery(req.query);
    const { format } = filters;

    if (filters.from && filters.to && filters.from > filters.to) {
      return sendError(res, "Invalid date range", 400);
    }

    const invoices = await fetchInvoiceGstRows(db, filters);
    const report = buildGstSummaryReport(invoices, filters.voucherType);

    if (isJsonReportFormat(format)) {
      return res.status(200).json({
        status: true,
        count: report.data.length + report.tax_data.length,
        message: "GST summary report",
        data: report.data,
        tax_data: report.tax_data,
        filters: {
          from: filters.from || null,
          to: filters.to || null,
          voucher_type: filters.voucherType,
          gst_type: filters.gstType,
          store: filters.storeId || null,
        },
        totals: report.totals,
      });
    }

    return exportGst(res, report.rows, format, "gst_summary_report", "GST Summary Report", filters, report.rows.length);
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const gstDetailedReport = async (req, res) => {
  try {
    await setSessionDefaults();
    const filters = normalizeGstReportQuery(req.query);
    const { format } = filters;

    if (filters.from && filters.to && filters.from > filters.to) {
      return sendError(res, "Invalid date range", 400);
    }

    const pagination = parseReportPagination(req.query);
    const invoices = await fetchInvoiceGstRows(db, filters);
    const slabRows = await fetchInvoiceGstSlabRows(db, filters);
    const report = buildGstDetailedReport(slabRows, invoices, filters.voucherType, filters);
    const dataPayload = {
      ...report.dataSection,
      rows: slicePaginated(report.dataSection.rows, pagination),
    };
    const taxDataPayload = {
      ...report.taxDataSection,
      rows: slicePaginated(report.taxDataSection.rows, pagination),
    };

    if (isJsonReportFormat(format)) {
      const salesRowCount = report.dataSection.report_rows;
      const returnRowCount = report.taxDataSection.report_rows;

      const body = {
        status: true,
        count: salesRowCount,
        tax_data_count: returnRowCount,
        message: "GST detailed report",
        data: dataPayload,
        tax_data: taxDataPayload,
      };
      if (pagination) {
        body.page = pagination.page;
        body.limit = pagination.limit;
      }
      return res.status(200).json(body);
    }

    return exportGst(res, report.rows, format, "gst_detailed_report", "GST Detailed Report", filters, report.rows.length);
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const gstReconciliationReport = async (req, res) => {
  try {
    await setSessionDefaults();
    const filters = normalizeGstReportQuery(req.query);

    if (filters.from && filters.to && filters.from > filters.to) {
      return sendError(res, "Invalid date range", 400);
    }

    const invoices = await fetchInvoiceGstRows(db, filters);
    const { grand } = buildGstSummaryReport(invoices, filters.voucherType);
    const detailedTotals = aggregateDetailedTotals(invoices);
    const reconciliation = buildReconciliation(grand, detailedTotals, invoices);

    return sendReportSuccess(res, "GST report reconciliation", {
      filters: {
        from: filters.from || null,
        to: filters.to || null,
        voucher_type: filters.voucherType,
        gst_type: filters.gstType,
      },
      reconciliation,
      summary_grand_total: grand,
      detailed_totals: {
        bill_count: detailedTotals.bill_count,
        net_amount: round2(detailedTotals.net_amount),
        taxable_amount: round2(detailedTotals.taxable_amount),
        total_tax: round2(detailedTotals.total_tax),
        igst: round2(detailedTotals.igst),
        cgst: round2(detailedTotals.cgst),
        sgst: round2(detailedTotals.sgst),
      },
    }, detailedTotals.bill_count);
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const gstSalesReport = async (req, res) => {
  try {
    await setSessionDefaults();
    const { from, to, format } = req.query;
    const pagination = parseReportPagination(req.query);
    const params = [];
    const dateClause = dateFilter(from, to, params);

    const salesFrom = `
       FROM transactions t
       JOIN transaction_billing tb ON tb.id = t.bill_id
       JOIN products p ON p.id = t.product_id
       LEFT JOIN gst g ON g.id = t.gst_id
       WHERE tb.bill_type = 'sale' AND tb.status = 'completed' ${dateClause}`;

    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total ${salesFrom}`, {
      replacements: params,
    });

    let salesSql = `SELECT DATE(tb.createdon) AS date, tb.bill_no, p.hsn_code, p.product_name,
              g.tax AS gst_rate, t.quantity, t.unit_price,
              (t.line_total - t.gst_amount) AS taxable_value, t.gst_amount, t.cgst, t.sgst, t.igst, t.line_total
       ${salesFrom}
       ORDER BY tb.createdon`;
    const queryParams = [...params];
    if (pagination && isJsonReportFormat(format)) {
      salesSql += " LIMIT ? OFFSET ?";
      queryParams.push(pagination.limit, pagination.offset);
    }
    const [rows] = await db.query(salesSql, { replacements: queryParams });
    return exportGst(
      res,
      rows,
      format,
      "gst_sales_report",
      "GST Sales Report",
      { from, to },
      Number(total),
      pagination
    );
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const gstPurchaseReport = async (req, res) => {
  try {
    const { from, to, format } = req.query;
    const pagination = parseReportPagination(req.query);
    const params = [];
    const dateClause = dateFilter(from, to, params);

    const purchaseFrom = `
       FROM vendor_orders vo
       JOIN vendors v ON v.id = vo.vendor_id
       WHERE vo.status = 1 ${dateClause.replace(/tb.createdon/g, "vo.order_date")}`;

    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total ${purchaseFrom}`, {
      replacements: params,
    });

    let purchaseSql = `SELECT vo.order_date AS date, vo.bill_no, v.vendor_name, v.gst_number,
              vo.total_value AS taxable_value, vo.gst_amount,
              ROUND(vo.gst_amount/2,2) AS cgst, ROUND(vo.gst_amount/2,2) AS sgst, 0 AS igst,
              (vo.total_value + vo.gst_amount) AS total
       ${purchaseFrom}
       ORDER BY vo.order_date`;
    const queryParams = [...params];
    if (pagination && isJsonReportFormat(format)) {
      purchaseSql += " LIMIT ? OFFSET ?";
      queryParams.push(pagination.limit, pagination.offset);
    }
    const [rows] = await db.query(purchaseSql, { replacements: queryParams });
    return exportGst(
      res,
      rows,
      format,
      "gst_purchase_report",
      "GST Purchase Report",
      { from, to },
      Number(total),
      pagination
    );
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const hsnSummaryReport = async (req, res) => {
  try {
    const { from, to, format } = req.query;
    const pagination = parseReportPagination(req.query);
    const params = [];
    const dateClause = dateFilter(from, to, params);

    const hsnFrom = `
       FROM transactions t
       JOIN transaction_billing tb ON tb.id = t.bill_id
       JOIN products p ON p.id = t.product_id
       LEFT JOIN gst g ON g.id = t.gst_id
       WHERE tb.bill_type = 'sale' AND tb.status = 'completed' ${dateClause}`;

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM (
         SELECT 1 ${hsnFrom} GROUP BY p.hsn_code, g.tax
       ) AS hsn_groups`,
      { replacements: params }
    );

    let hsnSql = `SELECT COALESCE(p.hsn_code,'N/A') AS hsn_code, g.tax AS gst_rate,
              SUM(t.quantity) AS total_qty,
              SUM(t.line_total - t.gst_amount) AS taxable_value,
              SUM(t.gst_amount) AS total_gst,
              SUM(t.cgst) AS cgst, SUM(t.sgst) AS sgst, SUM(t.igst) AS igst
       ${hsnFrom}
       GROUP BY p.hsn_code, g.tax ORDER BY hsn_code`;
    const queryParams = [...params];
    if (pagination && isJsonReportFormat(format)) {
      hsnSql += " LIMIT ? OFFSET ?";
      queryParams.push(pagination.limit, pagination.offset);
    }
    const [rows] = await db.query(hsnSql, { replacements: queryParams });
    return exportGst(res, rows, format, "hsn_summary", "HSN Summary", { from, to }, Number(total), pagination);
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const combinedGstReport = async (req, res) => {
  const { from, to, format } = req.query;
  if (format === "excel") {
    const params = [];
    const dc = dateFilter(from, to, params);
    const [sales] = await db.query(
      `SELECT * FROM transactions t JOIN transaction_billing tb ON tb.id=t.bill_id
       WHERE tb.bill_type='sale' AND tb.status='completed' ${dc} LIMIT 5000`,
      { replacements: params }
    );
    const [purchase] = await db.query(
      `SELECT * FROM vendor_orders vo WHERE vo.status=1 ${dc.replace(/tb.createdon/g,"vo.order_date")}`,
      { replacements: [...params] }
    );
    const [hsn] = await db.query(
      `SELECT COALESCE(p.hsn_code,'N/A') hsn, SUM(t.gst_amount) total_gst
       FROM transactions t JOIN products p ON p.id=t.product_id
       JOIN transaction_billing tb ON tb.id=t.bill_id
       WHERE tb.bill_type='sale' ${dc} GROUP BY p.hsn_code`,
      { replacements: params }
    );
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(sales), "Sales");
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(purchase), "Purchase");
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(hsn), "HSN");
    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", "attachment; filename=gst_combined.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(buf);
  }
  return sendError(res, "Use format=excel for combined export or call individual endpoints");
};

async function exportGst(res, data, format, filename, title = filename, filters = {}, count = null, pagination = null) {
  const rows = Array.isArray(data) ? data : [];
  const total = count != null ? count : rows.length;

  if (isJsonReportFormat(format)) return sendReportSuccess(res, "GST report", rows, total, pagination);

  if (format === "excel") {
    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Report");
    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", `attachment; filename=${filename}.xlsx`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(buf);
  }

  if (format === "csv") {
    const ws = xlsx.utils.json_to_sheet(rows);
    const csv = xlsx.utils.sheet_to_csv(ws);
    res.setHeader("Content-Disposition", `attachment; filename=${filename}.csv`);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    return res.send(`\ufeff${csv}`);
  }

  if (format === "pdf") {
    const colCount = Object.keys(rows[0] || {}).length;
    const html = buildTabularReportHtml({
      title,
      rows,
      metaLines: buildReportMetaLines({
        from: filters.from,
        to: filters.to,
        extra: filters.voucherType ? [`Voucher type: ${filters.voucherType}`] : [],
      }),
      landscape: colCount > 8,
    });
    const pdf = await htmlToPdfBuffer(html, { landscape: colCount > 8 });
    return sendPdf(res, pdf, filename);
  }

  return sendReportSuccess(res, "GST report", rows, total, pagination);
}
