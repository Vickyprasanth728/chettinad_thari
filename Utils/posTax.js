/**
 * POS line GST — matches admin gst master:
 * - exclusive: tax added on top of retail (same as mock POS)
 * - inclusive: retail_price already includes tax (extract base + GST)
 */

function roundCurrency(value) {
  return Number(Number(value).toFixed(2));
}

export function buildPaymentMismatchDetail({
  itemsTotal,
  billDiscount,
  grandTotal,
  creditApplied,
  paymentTotal,
}) {
  const expectedAmount = roundCurrency(grandTotal - creditApplied);
  const receivedAmount = roundCurrency(paymentTotal);
  const difference = roundCurrency(Math.abs(receivedAmount - expectedAmount));

  return {
    field: "payments",
    message: `Split payment total (${receivedAmount.toFixed(2)}) must match final payable amount (${expectedAmount.toFixed(2)}).`,
    amount: expectedAmount,
    paymentTotal: receivedAmount,
    difference,
    itemsTotal: roundCurrency(itemsTotal),
    billDiscount: roundCurrency(billDiscount),
    grandTotal: roundCurrency(grandTotal),
    creditApplied: roundCurrency(creditApplied),
  };
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
  const billDiscountShare = roundCurrency(Number(line.billDiscountShare || 0));
  const gstType = String(line.gstType ?? line.gst_type ?? options.gstType ?? "exclusive").toLowerCase();

  const grossAmount = roundCurrency(qty * unitPrice);
  const amountAfterDiscount = roundCurrency(Math.max(0, grossAmount - billDiscountShare));

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
    billDiscountShare,
    grossAmount,
    taxableAmount,
    gstAmount,
    cgst,
    sgst,
    igst,
    lineTotal,
  };
}

/** Amounts after bill discount — used for bill totals and persistence. */
export function getLineNetAmounts(line) {
  return {
    lineTotal: roundCurrency(Number(line.netLineTotal ?? line.lineTotal ?? 0)),
    taxableAmount: roundCurrency(Number(line.netTaxableAmount ?? line.taxableAmount ?? 0)),
    gstAmount: roundCurrency(Number(line.netGstAmount ?? line.gstAmount ?? 0)),
    cgst: roundCurrency(Number(line.netCgst ?? line.cgst ?? 0)),
    sgst: roundCurrency(Number(line.netSgst ?? line.sgst ?? 0)),
    igst: roundCurrency(Number(line.netIgst ?? line.igst ?? 0)),
  };
}

export function resolveBillDiscount(draft) {
  const raw =
    draft?.billDiscount ??
    draft?.bill_discount ??
    draft?.summary?.billDiscount ??
    draft?.summary?.bill_discount;
  if (raw === undefined || raw === null || raw === "") {
    return { billDiscount: 0, invalid: false };
  }
  const value = Number(raw);
  if (Number.isNaN(value)) {
    return { billDiscount: 0, invalid: true };
  }
  return { billDiscount: roundCurrency(Math.max(0, value)), invalid: value < 0 };
}

export function resolveCreditApplied(draft) {
  const raw =
    draft?.creditApplied ??
    draft?.credit_to_apply ??
    draft?.creditToApply ??
    draft?.summary?.creditApplied ??
    draft?.summary?.credit_to_apply;
  if (raw === undefined || raw === null || raw === "") {
    return { creditApplied: 0, invalid: false };
  }
  const value = Number(raw);
  if (Number.isNaN(value)) {
    return { creditApplied: 0, invalid: true };
  }
  return { creditApplied: roundCurrency(Math.max(0, value)), invalid: value < 0 };
}

/** Normalize POS billing payload field aliases from frontend / legacy APIs. */
export function normalizeBillingPayload(payload = {}) {
  const normalized = { ...payload };
  const { billDiscount } = resolveBillDiscount(normalized);
  const { creditApplied } = resolveCreditApplied(normalized);
  normalized.billDiscount = billDiscount;
  normalized.creditApplied = creditApplied;
  return normalized;
}

/** Customer-facing line total before bill discount (inclusive of GST for exclusive items). */
export function getBillDiscountableBase(line, options = { isInterState: false }) {
  if (
    line.lineTotal != null &&
    Number(line.billDiscountShare || 0) === 0 &&
    line.gstRate != null &&
    !Number.isNaN(Number(line.gstRate))
  ) {
    return roundCurrency(Number(line.lineTotal));
  }
  return calculateLineTax({ ...line, billDiscountShare: 0 }, options).lineTotal;
}

export function getMaxBillDiscount(lines = [], options = { isInterState: false }) {
  return roundCurrency(lines.reduce((sum, line) => sum + getBillDiscountableBase(line, options), 0));
}

/** Allocate bill discount across lines before GST, then recalculate line tax. */
export function distributeBillDiscount(lines, billDiscount, options = { isInterState: false }) {
  if (!Array.isArray(lines) || lines.length === 0 || !billDiscount || billDiscount <= 0) {
    return lines;
  }

  const weights = lines.map((line) => getBillDiscountableBase(line, options));
  const totalWeight = roundCurrency(weights.reduce((sum, weight) => sum + weight, 0));
  const effectiveBillDiscount = roundCurrency(Math.min(Math.max(0, billDiscount), totalWeight));
  if (effectiveBillDiscount <= 0) return lines;

  let allocated = 0;
  return lines.map((line, index) => {
    let share;
    if (index === lines.length - 1) {
      share = roundCurrency(effectiveBillDiscount - allocated);
    } else if (totalWeight <= 0) {
      share = 0;
    } else {
      share = roundCurrency((effectiveBillDiscount * weights[index]) / totalWeight);
      allocated = roundCurrency(allocated + share);
    }

    const adjusted = calculateLineTax(
      {
        ...line,
        billDiscountShare: share,
      },
      options
    );
    const baseLine = calculateLineTax({ ...line, billDiscountShare: 0 }, options);

    return {
      ...baseLine,
      billDiscountShare: share,
      netLineTotal: adjusted.lineTotal,
      netTaxableAmount: adjusted.taxableAmount,
      netGstAmount: adjusted.gstAmount,
      netCgst: adjusted.cgst,
      netSgst: adjusted.sgst,
      netIgst: adjusted.igst,
    };
  });
}

export function applyBillDiscount(originalSummary, lines, billDiscount, options = { isInterState: false }) {
  const discountableBase = getMaxBillDiscount(lines, options);
  const adjustedLines = distributeBillDiscount(lines, billDiscount, options);
  const adjustedSummary = summarizeTax(adjustedLines);
  const effectiveBillDiscount = roundCurrency(
    adjustedLines.reduce((sum, line) => sum + Number(line.billDiscountShare || 0), 0)
  );

  return {
    lines: adjustedLines,
    summary: {
      ...adjustedSummary,
      itemsTotal: roundCurrency(Number(originalSummary.grandTotal || 0)),
      discountableBase,
      billDiscount: effectiveBillDiscount,
      discountTotal: effectiveBillDiscount,
    },
  };
}

export function summarizeTax(lines) {
  const byRate = {};
  const summary = lines.reduce(
    (acc, line) => {
      const net = getLineNetAmounts(line);
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
      bucket.taxableAmount = roundCurrency(bucket.taxableAmount + net.taxableAmount);
      bucket.cgst = roundCurrency(bucket.cgst + net.cgst);
      bucket.sgst = roundCurrency(bucket.sgst + net.sgst);
      bucket.igst = roundCurrency(bucket.igst + net.igst);
      bucket.gstAmount = roundCurrency(bucket.gstAmount + net.gstAmount);
      bucket.lineTotal = roundCurrency(bucket.lineTotal + net.lineTotal);

      acc.totalTaxableAmount = roundCurrency(acc.totalTaxableAmount + net.taxableAmount);
      acc.totalCgst = roundCurrency(acc.totalCgst + net.cgst);
      acc.totalSgst = roundCurrency(acc.totalSgst + net.sgst);
      acc.totalIgst = roundCurrency(acc.totalIgst + net.igst);
      acc.totalGst = roundCurrency(acc.totalGst + net.gstAmount);
      acc.grandTotal = roundCurrency(acc.grandTotal + net.lineTotal);
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

  const { billDiscount, invalid: billDiscountInvalid } = resolveBillDiscount(draft);
  if (billDiscountInvalid) {
    errors.push({ field: "billDiscount", message: "Bill discount must be a non-negative number." });
  }

  const { creditApplied, invalid: creditInvalid } = resolveCreditApplied(draft);
  if (creditInvalid) {
    errors.push({ field: "creditApplied", message: "Credit applied must be a non-negative number." });
  }

  const discountableBase = roundCurrency(
    Number(draft.summary?.discountableBase ?? 0) ||
      (draft.items || []).reduce(
        (sum, item) =>
          sum +
          getBillDiscountableBase({
            qty: item.qty,
            unitPrice: item.unitPrice,
            gstRate: item.gstRate,
            gstType: item.gstType,
          }),
        0
      )
  );
  const itemsTotal = roundCurrency(Number(draft.summary?.itemsTotal || 0));
  if (billDiscount > discountableBase + 0.01) {
    errors.push({
      field: "billDiscount",
      message: `Bill discount (${billDiscount.toFixed(2)}) cannot exceed bill total before discount (${discountableBase.toFixed(2)}).`,
      amount: discountableBase,
      billDiscount,
      itemsTotal,
    });
  }

  const grandTotal = roundCurrency(Number(draft.summary?.grandTotal || 0));
  if (creditApplied > grandTotal + 0.01) {
    errors.push({
      field: "creditApplied",
      message: `Credit applied (${creditApplied.toFixed(2)}) cannot exceed bill total after discount (${grandTotal.toFixed(2)}).`,
      amount: grandTotal,
      creditApplied,
      billDiscount: roundCurrency(Number(draft.summary?.billDiscount ?? billDiscount ?? 0)),
    });
  }

  const splitTotal = roundCurrency((draft.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0));
  const payable = roundCurrency(grandTotal - creditApplied);
  if (draft.payments?.length > 0 && Math.abs(splitTotal - payable) > 0.01) {
    errors.push(
      buildPaymentMismatchDetail({
        itemsTotal,
        billDiscount: roundCurrency(Number(draft.summary?.billDiscount ?? billDiscount ?? 0)),
        grandTotal,
        creditApplied,
        paymentTotal: splitTotal,
      })
    );
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
