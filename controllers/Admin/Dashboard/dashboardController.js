import { db, setSessionDefaults } from "../../../config/Database.js";
import { sendSuccess, sendError } from "../../../Utils/response.js";
import { getCurrentISTDate } from "../../../Utils/Datetime.js";

const saleFilter = `tb.bill_type = 'sale' AND tb.status = 'completed'`;

const LOW_STOCK_WHERE = `p.status != 0 AND p.quantity <= p.low_stock_threshold`;

const buildVendorProducts = (rows) => {
  const byVendor = new Map();
  for (const row of rows) {
    if (!byVendor.has(row.vendor_id)) {
      byVendor.set(row.vendor_id, {
        vendor_id: row.vendor_id,
        vendor_name: row.vendor_name,
        products: [],
      });
    }
    if (row.id != null) {
      byVendor.get(row.vendor_id).products.push({
        id: row.id,
        stock_no: row.stock_no,
        product_name: row.product_name,
        quantity: Number(row.quantity) || 0,
        retail_price: row.retail_price,
      });
    }
  }
  return [...byVendor.values()];
};

export const getDashboardSummary = async (req, res) => {
  try {
    await setSessionDefaults();
    const today = await getCurrentISTDate();

    const [[sales]] = await db.query(
      `SELECT COALESCE(COUNT(*), 0) AS total_sales_count,
              COALESCE(SUM(total), 0) AS total_sales,
              COALESCE(SUM(CASE WHEN DATE(createdon)=? THEN total ELSE 0 END), 0) AS daily_sales,
              COALESCE(SUM(CASE WHEN YEAR(createdon)=YEAR(?) AND MONTH(createdon)=MONTH(?) THEN total ELSE 0 END), 0) AS monthly_sales
       FROM transaction_billing tb WHERE ${saleFilter}`,
      { replacements: [today, today, today] }
    );

    const [[{ low_stock_count }]] = await db.query(
      `SELECT COUNT(*) AS low_stock_count FROM products p WHERE ${LOW_STOCK_WHERE}`
    );

    const [lowStock] = await db.query(
      `SELECT p.id, p.stock_no, p.product_name, p.quantity, p.low_stock_threshold, v.vendor_name
       FROM products p LEFT JOIN vendors v ON v.id = p.vendor_id
       WHERE ${LOW_STOCK_WHERE} ORDER BY p.quantity ASC LIMIT 20`
    );

    const [vendorStock] = await db.query(
      `SELECT v.id, v.vendor_name, COUNT(p.id) AS product_count, COALESCE(SUM(p.quantity),0) AS total_quantity
       FROM vendors v LEFT JOIN products p ON p.vendor_id = v.id AND p.status = 1
       WHERE v.status = 1 GROUP BY v.id ORDER BY total_quantity DESC`
    );

    const [vendorProductRows] = await db.query(
      `SELECT v.id AS vendor_id, v.vendor_name,
              p.id, p.stock_no, p.product_name, p.quantity, p.retail_price
       FROM vendors v
       LEFT JOIN products p ON p.vendor_id = v.id AND p.status = 1
       WHERE v.status = 1
       ORDER BY p.product_name ASC`
    );
    const vendorOrder = new Map(vendorStock.map((v, i) => [v.id, i]));
    const vendorProducts = buildVendorProducts(vendorProductRows).sort(
      (a, b) => (vendorOrder.get(a.vendor_id) ?? 999) - (vendorOrder.get(b.vendor_id) ?? 999)
    );

    const [vendorPending] = await db.query(
      `SELECT v.id, v.vendor_name,
              COALESCE((SELECT SUM(total_value) FROM vendor_orders WHERE vendor_id=v.id AND status=1),0) -
              COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE vendor_id=v.id),0) AS pending
       FROM vendors v WHERE v.status = 1 HAVING pending > 0`
    );
    const totalPending = vendorPending.reduce((s, v) => s + Number(v.pending), 0);

    const [topSelling] = await db.query(
      `SELECT p.product_name, p.stock_no, SUM(t.quantity) AS total_qty_sold, SUM(t.line_total) AS total_revenue
       FROM transactions t JOIN transaction_billing tb ON tb.id = t.bill_id
       JOIN products p ON p.id = t.product_id
       WHERE ${saleFilter}
       GROUP BY p.id ORDER BY total_qty_sold DESC LIMIT 10`
    );

    return sendSuccess(res, "Dashboard summary", {
      total_sales_count: Number(sales.total_sales_count) || 0,
      total_sales: sales.total_sales,
      daily_sales: sales.daily_sales,
      monthly_sales: sales.monthly_sales,
      low_stock_count: Number(low_stock_count) || 0,
      low_stock_products: lowStock,
      vendor_wise_stock: vendorStock,
      vendor_products: vendorProducts,
      pending_vendor_payments: { total_pending: totalPending, vendors: vendorPending },
      top_selling_products: topSelling,
    });
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export const getLowStock = async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 20;
  const [rows] = await db.query(
    `SELECT p.id, p.stock_no, p.product_name, p.quantity, p.low_stock_threshold, v.vendor_name
     FROM products p LEFT JOIN vendors v ON v.id = p.vendor_id
     WHERE ${LOW_STOCK_WHERE}
     ORDER BY p.quantity ASC LIMIT ?`,
    { replacements: [limit] }
  );
  return sendSuccess(res, "Low stock", rows);
};

export const getSalesChart = async (req, res) => {
  const period = req.query.period || "daily";
  const from = req.query.from;
  const to = req.query.to;
  let groupBy = "DATE(createdon)";
  if (period === "monthly") groupBy = "DATE_FORMAT(createdon, '%Y-%m')";

  let where = `WHERE ${saleFilter}`;
  const params = [];
  if (from && to) { where += ` AND DATE(createdon) BETWEEN ? AND ?`; params.push(from, to); }

  const [chart] = await db.query(
    `SELECT ${groupBy} AS period, SUM(total) AS sales FROM transaction_billing tb ${where} GROUP BY period ORDER BY period`,
    { replacements: params }
  );
  return sendSuccess(res, "Sales chart", chart);
};
