/**
 * POS line GST — matches admin gst master:
 * - exclusive: tax added on top of retail (same as mock POS)
 * - inclusive: retail_price already includes tax (extract base + GST)
 */

function roundCurrency(value) {
  return Number(Number(value).toFixed(2));
}

function splitGst(gstAmount, isInterState) {
  if (isInterState) {
    return { cgst: 0, sgst: 0, igst: roundCurrency(gstAmount) };
  }
  const cgst = roundCurrency(gstAmount / 2);
  return { cgst, sgst: roundCurrency(gstAmount - cgst), igst: 0 };
}

export function calculateLineTax(line, options = { isInterState: false }) {
  const qty = Number(line.qty || 0);
  const unitPrice = Number(line.unitPrice ?? line.unit_price ?? 0);
  const gstRate = Number(line.gstRate ?? line.gst_rate ?? 0);
  const discount = Number(line.discount || 0);
  const gstType = String(line.gstType ?? line.gst_type ?? options.gstType ?? "exclusive").toLowerCase();

  const grossAmount = roundCurrency(qty * unitPrice);
  const amountAfterDiscount = roundCurrency(Math.max(0, grossAmount - discount));

  let taxableAmount;
  let gstAmount;
  let lineTotal;

  if (gstType === "inclusive" && gstRate > 0) {
    lineTotal = amountAfterDiscount;
    taxableAmount = roundCurrency(amountAfterDiscount / (1 + gstRate / 100));
    gstAmount = roundCurrency(amountAfterDiscount - taxableAmount);
  } else {
    taxableAmount = amountAfterDiscount;
    gstAmount = roundCurrency((taxableAmount * gstRate) / 100);
    lineTotal = roundCurrency(taxableAmount + gstAmount);
  }

  const { cgst, sgst, igst } = splitGst(gstAmount, options.isInterState);

  return {
    ...(line.transactionId != null ? { transactionId: String(line.transactionId) } : {}),
    productId: String(line.productId ?? line.product_id),
    qty,
    unitPrice,
    gstRate,
    gstType,
    discount,
    grossAmount,
    taxableAmount,
    gstAmount,
    cgst,
    sgst,
    igst,
    lineTotal,
  };
}

export function summarizeTax(lines) {
  const byRate = {};
  const summary = lines.reduce(
    (acc, line) => {
      const rateKey = String(line.gstRate ?? 0);
      if (!byRate[rateKey]) {
        byRate[rateKey] = {
          gstRate: Number(rateKey),
          taxableAmount: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          gstAmount: 0,
          lineTotal: 0,
        };
      }
      const bucket = byRate[rateKey];
      bucket.taxableAmount = roundCurrency(bucket.taxableAmount + line.taxableAmount);
      bucket.cgst = roundCurrency(bucket.cgst + line.cgst);
      bucket.sgst = roundCurrency(bucket.sgst + line.sgst);
      bucket.igst = roundCurrency(bucket.igst + line.igst);
      bucket.gstAmount = roundCurrency(bucket.gstAmount + line.gstAmount);
      bucket.lineTotal = roundCurrency(bucket.lineTotal + line.lineTotal);

      acc.totalTaxableAmount = roundCurrency(acc.totalTaxableAmount + line.taxableAmount);
      acc.totalCgst = roundCurrency(acc.totalCgst + line.cgst);
      acc.totalSgst = roundCurrency(acc.totalSgst + line.sgst);
      acc.totalIgst = roundCurrency(acc.totalIgst + line.igst);
      acc.totalGst = roundCurrency(acc.totalGst + line.gstAmount);
      acc.grandTotal = roundCurrency(acc.grandTotal + line.lineTotal);
      return acc;
    },
    {
      totalTaxableAmount: 0,
      totalCgst: 0,
      totalSgst: 0,
      totalIgst: 0,
      totalGst: 0,
      grandTotal: 0,
    }
  );

  return {
    ...summary,
    byRate: Object.values(byRate).sort((a, b) => a.gstRate - b.gstRate),
  };
}

export function validateBillDraft(draft) {
  const errors = [];
  if (!Array.isArray(draft.items) || draft.items.length === 0) {
    errors.push({ field: "items", message: "Bill must contain at least one item." });
  }
  (draft.items || []).forEach((item, idx) => {
    if (item.gstRate === undefined || item.gstRate === null || Number.isNaN(Number(item.gstRate))) {
      errors.push({ field: `items[${idx}].gstRate`, message: "GST rate is mandatory for each product." });
    }
    if (Number(item.qty) <= 0) {
      errors.push({ field: `items[${idx}].qty`, message: "Quantity must be greater than zero." });
    }
  });
  const splitTotal = roundCurrency((draft.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0));
  const payable = roundCurrency(Number(draft.summary?.grandTotal || 0) - Number(draft.creditApplied || 0));
  if (draft.payments?.length > 0 && Math.abs(splitTotal - payable) > 0.01) {
    errors.push({ field: "payments", message: "Split payment total must match final payable amount." });
  }
  return errors;
}

export function validateReturnDraft(returnDraft, parentBill, alreadyReturnedByProduct = {}) {
  const errors = [];
  const parentMap = new Map((parentBill.items || []).map((item) => [String(item.productId), item]));
  const selectedItems = returnDraft.items || [];

  if (selectedItems.length === 0) {
    errors.push({ field: "items", message: "At least one return item with quantity is required." });
  }

  selectedItems.forEach((line, idx) => {
    const pid = String(line.productId);
    const original = parentMap.get(pid);
    if (!original) {
      errors.push({ field: `items[${idx}].productId`, message: "Return item must exist in original bill." });
      return;
    }
    const requestedQty = Number(line.qty);
    const alreadyReturnedQty = Number(alreadyReturnedByProduct[pid] || 0);
    if (requestedQty <= 0) {
      errors.push({ field: `items[${idx}].qty`, message: "Return quantity must be greater than zero." });
    }
    if (requestedQty + alreadyReturnedQty > Number(original.qty)) {
      errors.push({ field: `items[${idx}].qty`, message: "Return quantity cannot exceed remaining purchased quantity." });
    }
  });

  return errors;
}
