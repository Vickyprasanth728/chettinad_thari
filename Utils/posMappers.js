const PAYMENT_TO_DB = {
  CASH: "cash",
  CARD: "card",
  UPI: "upi",
  NET_BANKING: "net_banking",
  ONLINE: "online",
};

const PAYMENT_FROM_DB = Object.fromEntries(
  Object.entries(PAYMENT_TO_DB).map(([k, v]) => [v, k.toUpperCase() === "NET_BANKING" ? "NET_BANKING" : v.toUpperCase()])
);
PAYMENT_FROM_DB.cash = "CASH";
PAYMENT_FROM_DB.card = "CARD";
PAYMENT_FROM_DB.upi = "UPI";
PAYMENT_FROM_DB.net_banking = "NET_BANKING";
PAYMENT_FROM_DB.online = "ONLINE";
PAYMENT_FROM_DB.credit = "CREDIT";

export function paymentModeToDb(mode) {
  return PAYMENT_TO_DB[String(mode || "").toUpperCase()] || String(mode || "cash").toLowerCase();
}

export function paymentModeFromDb(mode) {
  return PAYMENT_FROM_DB[String(mode || "").toLowerCase()] || String(mode || "").toUpperCase();
}

import { computeStockStatus, getDefaultLowStockThreshold } from "./posStock.js";
import { calculateLineTax } from "./posTax.js";

export function mapProductRow(row) {
  const gstId = row.gst_id != null ? Number(row.gst_id) : null;
  const stockQty = Number(row.quantity ?? row.stockQty ?? 0);
  const lowStockThreshold =
    row.low_stock_threshold != null
      ? Number(row.low_stock_threshold)
      : getDefaultLowStockThreshold();
  return {
    productId: String(row.id),
    stockNo: row.stock_no || "",
    name: row.product_name || row.name || "",
    unitPrice: Number(row.retail_price ?? row.unitPrice ?? 0),
    discount: Number(row.discount ?? 0),
    gstId,
    gstRate: gstId != null ? Number(row.gst_rate ?? row.tax ?? 0) : Number(row.gst_rate ?? row.tax ?? 0),
    gstType: String(row.gst_type ?? row.type ?? "exclusive").toLowerCase(),
    stockQty,
    lowStockThreshold,
    stockStatus: computeStockStatus(stockQty, lowStockThreshold),
  };
}

export function mapCustomerRow(row) {
  return {
    customerId: String(row.id),
    name: row.name || "",
    mobile: row.mobile || "",
    email: row.email || "",
    gstNumber: row.gst_number || row.gstNumber || "",
    state: row.state || "",
  };
}

export function mapBillPayments(rows) {
  return (rows || []).map((p, i) => ({
    paymentId: `PAY-${p.id || i}`,
    billNo: p.bill_no,
    mode: paymentModeFromDb(p.payment_method),
    amount: Number(p.amount),
    transactionRef: p.transaction_ref || null,
  }));
}

export function mapTransactionLine(t, gstRate = 0, gstType = "exclusive") {
  const billDiscountShare = Number(t.discount || 0);
  const base = calculateLineTax({
    productId: String(t.product_id),
    qty: Number(t.quantity),
    unitPrice: Number(t.unit_price),
    gstRate: Number(gstRate),
    gstType: String(gstType || "exclusive").toLowerCase(),
    billDiscountShare: 0,
  });

  return {
    transactionId: String(t.id),
    productId: String(t.product_id),
    qty: Number(t.quantity),
    unitPrice: Number(t.unit_price),
    gstRate: Number(gstRate),
    gstType: String(gstType || "exclusive").toLowerCase(),
    billDiscountShare,
    grossAmount: base.grossAmount,
    taxableAmount: base.taxableAmount,
    gstAmount: base.gstAmount,
    cgst: base.cgst,
    sgst: base.sgst,
    igst: base.igst,
    lineTotal: base.lineTotal,
    productName: t.product_name,
  };
}

export function buildBillSummaryFromDb(bill) {
  return {
    totalTaxableAmount: Number(bill.subtotal || 0),
    totalCgst: Number(bill.cgst || 0),
    totalSgst: Number(bill.sgst || 0),
    totalIgst: 0,
    totalGst: Number(bill.gst_total || 0),
    grandTotal: Number(bill.total || 0),
    byRate: [],
  };
}
