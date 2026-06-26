import { db } from "../config/Database.js";
import { formatPaymentMethod, formatPaymentMethodsList } from "./paymentMethodHelper.js";

export function toNumber(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

export async function resolveBillId(billIdOrNo) {
  const [[row]] = await db.query(
    `SELECT id FROM transaction_billing WHERE id = ? OR bill_no = ? LIMIT 1`,
    { replacements: [billIdOrNo, billIdOrNo] }
  );
  return row?.id ?? null;
}

export function formatBillListRow(row) {
  return {
    id: row.id,
    bill_no: row.bill_no,
    createdon: row.createdon,
    subtotal: toNumber(row.subtotal),
    discount: toNumber(row.discount),
    gst_total: toNumber(row.gst_total),
    total: toNumber(row.total),
    credit_applied: toNumber(row.credit_applied),
    payment_status: row.payment_status,
    status: row.status,
    manual_order_number: row.manual_order_number ?? "",
    customer_name: row.customer_name,
    customer_mobile: row.customer_mobile,
    staff_name: row.staff_name,
    payment_methods: formatPaymentMethodsList(row.payment_methods),
    item_count: Number(row.item_count) || 0,
  };
}

export function formatPaymentRow(payment) {
  return {
    id: payment.id,
    payment_method: formatPaymentMethod(payment.payment_method),
    amount: toNumber(payment.amount),
  };
}

export function formatBillLineItem(line, returnedQty = 0) {
  const qty = Number(line.quantity) || 0;
  const returned = Number(returnedQty) || 0;
  return {
    id: line.id,
    product_id: line.product_id,
    product_name: line.product_name,
    stock_no: line.stock_no,
    quantity: qty,
    unit_price: toNumber(line.unit_price),
    gst_amount: toNumber(line.gst_amount),
    cgst: toNumber(line.cgst),
    sgst: toNumber(line.sgst),
    line_total: toNumber(line.line_total),
    returned_qty: returned,
    returnable_qty: Math.max(0, qty - returned),
  };
}

export function formatBillDetail(bill, items, payments) {
  return {
    id: bill.id,
    bill_no: bill.bill_no,
    bill_type: bill.bill_type,
    customer_id: bill.customer_id,
    customer_name: bill.customer_name,
    customer_mobile: bill.customer_mobile ?? bill.mobile,
    email: bill.email,
    customer_gst: bill.customer_gst ?? "",
    staff_id: bill.staff_id,
    staff_name: bill.staff_name,
    subtotal: toNumber(bill.subtotal),
    discount: toNumber(bill.discount),
    gst_total: toNumber(bill.gst_total),
    total: toNumber(bill.total),
    credit_applied: toNumber(bill.credit_applied),
    payment_status: bill.payment_status,
    status: bill.status,
    manual_order_number: bill.manual_order_number ?? "",
    createdon: bill.createdon,
    items,
    payments: payments.map(formatPaymentRow),
  };
}

export function formatReturnListRow(row) {
  return {
    id: row.id,
    return_bill_no: row.return_bill_no,
    return_date: row.return_date,
    total_amount: toNumber(row.total_amount),
    status: row.status,
    parent_bill_no: row.parent_bill_no,
    parent_bill_id: row.parent_bill_id,
    customer_name: row.customer_name,
    mobile: row.mobile,
  };
}

export function formatCreditWalletRow(row) {
  return {
    customer_id: row.customer_id,
    customer_name: row.customer_name,
    mobile: row.mobile,
    credit_balance: toNumber(row.credit_balance),
    last_updated: row.last_updated,
    total_earned: toNumber(row.total_earned),
    total_redeemed: toNumber(row.total_redeemed),
  };
}

export function formatBillReturnSummary(row) {
  return {
    id: row.id,
    bill_no: row.bill_no,
    parent_bill_id: row.parent_bill_id,
    total: toNumber(row.total),
    status: row.status,
    createdon: row.createdon,
  };
}

export function formatCancelListRow(row) {
  return {
    id: row.id,
    bill_no: row.bill_no,
    cancel_date: row.cancel_date,
    cancelled_amount: toNumber(row.cancelled_amount),
    cancel_type: row.cancel_type,
    status: row.status,
    cancellation_reason: row.cancellation_reason ?? "",
    customer_name: row.customer_name,
    mobile: row.mobile,
  };
}

export function formatCancelLineItem(line, billStatus = "completed") {
  const qty = Number(line.quantity) || 0;
  const cancelledQty = Number(line.cancelled_qty) || 0;
  const returnedQty = Number(line.returned_qty) || 0;
  let effectiveCancelledQty = cancelledQty;
  if (billStatus === "cancelled" && cancelledQty === 0 && Number(line.status) === 0) {
    effectiveCancelledQty = qty;
  } else if (billStatus === "cancelled" && cancelledQty === 0) {
    effectiveCancelledQty = qty;
  }

  let cancelledAmount = 0;
  if (effectiveCancelledQty > 0 && qty > 0) {
    cancelledAmount = Math.round((Number(line.line_total) * effectiveCancelledQty) / qty * 100) / 100;
  } else if (Number(line.status) === 0) {
    cancelledAmount = Number(line.line_total) || 0;
  }

  const lineStatus =
    Number(line.status) === 0 || billStatus === "cancelled"
      ? "cancelled"
      : effectiveCancelledQty > 0
        ? "partial_cancelled"
        : "active";

  return {
    id: line.id,
    product_id: line.product_id,
    product_name: line.product_name,
    stock_no: line.stock_no,
    quantity: qty,
    cancelled_qty: effectiveCancelledQty,
    returned_qty: returnedQty,
    cancelled_amount: cancelledAmount,
    unit_price: toNumber(line.unit_price),
    gst_amount: toNumber(line.gst_amount),
    cgst: toNumber(line.cgst),
    sgst: toNumber(line.sgst),
    line_total: toNumber(line.line_total),
    line_status: lineStatus,
  };
}
