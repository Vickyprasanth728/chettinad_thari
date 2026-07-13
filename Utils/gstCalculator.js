import { db } from "../config/Database.js";

function round2(value) {
  return Number(Number(value).toFixed(2));
}

/**
 * Product list/detail total_price:
 * - retail_price is the selling price (discount is display-only: Before Discount − retail).
 * - inclusive: GST already in retail_price → total_price = retail_price
 * - exclusive: GST added on top → total_price = retail_price + GST
 */
export function computeProductTotalPrice(product) {
  const unitPrice = round2(Number(product.retail_price ?? 0));
  if (!product.gst_id) return unitPrice;

  const gstType = String(product.gst_type ?? product.type ?? "exclusive").toLowerCase();
  const gstPct = Number(product.gst_tax ?? product.tax ?? 0);

  if (gstType === "inclusive") return unitPrice;

  return round2(unitPrice + round2((unitPrice * gstPct) / 100));
}

export async function resolveProductTotalPrice(product) {
  const unitPrice = round2(Number(product.retail_price ?? 0));
  if (!product.gst_id) return unitPrice;

  const hasGstMeta =
    (product.gst_type ?? product.type) != null &&
    (product.gst_tax ?? product.tax) != null;

  if (hasGstMeta) return computeProductTotalPrice(product);

  const gstCalc = await calculateGST(product.gst_id, unitPrice);
  if (gstCalc.gstType === "exclusive") {
    return round2(unitPrice + gstCalc.gstprice);
  }
  return unitPrice;
}

export async function attachTotalPrice(product) {
  const total_price = await resolveProductTotalPrice(product);
  return { ...product, total_price };
}

export async function attachTotalPriceToProducts(products) {
  return Promise.all((products || []).map((product) => attachTotalPrice(product)));
}

export async function calculateGST(gstId, sellingPrice) {
  const [[gstRow]] = await db.query(`SELECT type, tax FROM gst WHERE id = ? AND status = 1`, {
    replacements: [gstId],
  });
  if (!gstRow) return { originalprice: sellingPrice, gstprice: 0, cgst: 0, sgst: 0, igst: 0 };

  const gstPercentage = Number(gstRow.tax);
  const gstType = gstRow.type;
  let originalprice = 0;
  let gstprice = 0;

  if (gstType === "inclusive") {
    originalprice = round2(sellingPrice / (1 + gstPercentage / 100));
    gstprice = round2(sellingPrice - originalprice);
  } else {
    originalprice = round2(sellingPrice);
    gstprice = round2((originalprice * gstPercentage) / 100);
  }

  const half = round2(gstprice / 2);
  return { originalprice, gstprice, cgst: half, sgst: half, igst: 0, gstPercentage, gstType };
}

export function calculateGstBreakdown(lineBase, gstAmount, gstType) {
  const type = String(gstType).toLowerCase();
  let basePrice = lineBase;
  let totalPrice = lineBase;

  if (type === "exclusive") {
    totalPrice = round2(basePrice + gstAmount);
  } else {
    basePrice = round2(lineBase);
    totalPrice = basePrice;
  }

  const half = round2(gstAmount / 2);
  return {
    basePrice,
    gstAmount: round2(gstAmount),
    totalPrice: round2(totalPrice),
    cgst: half,
    sgst: half,
    igst: 0,
  };
}

export function splitGstAmount(gstAmount, useIgst = false) {
  if (useIgst) return { cgst: 0, sgst: 0, igst: round2(gstAmount) };
  const half = round2(gstAmount / 2);
  return { cgst: half, sgst: half, igst: 0 };
}
