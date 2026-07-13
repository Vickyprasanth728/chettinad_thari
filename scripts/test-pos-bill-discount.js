/**
 * Unit tests for POS bill-level discount (no DB/server required).
 * Usage: node scripts/test-pos-bill-discount.js
 */
import { buildBillQuote } from "../services/posAppService.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function quote(payload) {
  return buildBillQuote(payload);
}

function testUserScenario() {
  const result = quote({
    billType: "POS",
    billDiscount: 1000,
    creditApplied: 500,
    items: [{ productId: "5659", qty: 1, unitPrice: 1800, gstRate: 12, gstType: "inclusive" }],
    payments: [{ mode: "CARD", amount: 300 }],
  });

  assert(result.validationErrors.length === 0, `Expected no errors, got ${JSON.stringify(result.validationErrors)}`);
  assert(result.summary.itemsTotal === 1800, "itemsTotal should be 1800");
  assert(result.summary.billDiscount === 1000, "billDiscount should be 1000");
  assert(result.summary.grandTotal === 800, "grandTotal after bill discount should be 800");
}

function testNoBillDiscountRegression() {
  const result = quote({
    items: [{ productId: "1", qty: 1, unitPrice: 1500, gstRate: 5, gstType: "exclusive" }],
    creditApplied: 0,
    payments: [{ mode: "CASH", amount: 1575 }],
  });

  assert(result.validationErrors.length === 0, "Simple bill without bill discount should pass");
  assert(result.summary.billDiscount === 0, "billDiscount should default to 0");
  assert(result.summary.grandTotal === 1575, "grandTotal should include GST for exclusive item");
}

function testBillDiscountExceedsTotal() {
  const result = quote({
    billDiscount: 2000,
    items: [{ productId: "1", qty: 1, unitPrice: 1800, gstRate: 12, gstType: "inclusive" }],
    payments: [{ mode: "CASH", amount: 0 }],
  });

  assert(
    result.validationErrors.some((e) => e.field === "billDiscount"),
    "Should reject bill discount greater than item total"
  );
}

function testCreditExceedsPayable() {
  const result = quote({
    billDiscount: 1000,
    creditApplied: 900,
    items: [{ productId: "1", qty: 1, unitPrice: 1800, gstRate: 12, gstType: "inclusive" }],
    payments: [{ mode: "CASH", amount: 0 }],
  });

  assert(
    result.validationErrors.some((e) => e.field === "creditApplied"),
    "Should reject credit greater than payable after bill discount"
  );
}

function testSnakeCaseAlias() {
  const result = quote({
    bill_discount: 500,
    items: [{ productId: "1", qty: 1, unitPrice: 1000, gstRate: 12, gstType: "inclusive" }],
    payments: [{ mode: "CASH", amount: 500 }],
  });

  assert(result.validationErrors.length === 0, "bill_discount alias should work");
  assert(result.summary.billDiscount === 500, "bill_discount alias should apply");
  assert(result.summary.grandTotal === 500, "grandTotal should reflect bill_discount");
}

function testSummaryBillDiscountFallback() {
  const result = quote({
    creditApplied: 500,
    items: [{ productId: "1", qty: 1, unitPrice: 1800, gstRate: 12, gstType: "inclusive" }],
    payments: [{ mode: "CASH", amount: 300 }],
    summary: { billDiscount: 1000 },
  });

  assert(result.validationErrors.length === 0, "summary.billDiscount fallback should pass");
  assert(result.summary.billDiscount === 1000, "summary.billDiscount should apply");
  assert(result.summary.payableAmount === 300, "payableAmount should be 300");
}

function testCreditToApplyAlias() {
  const result = quote({
    billDiscount: 1000,
    credit_to_apply: 500,
    items: [{ productId: "1", qty: 1, unitPrice: 1800, gstRate: 12, gstType: "inclusive" }],
    payments: [{ mode: "CASH", amount: 300 }],
  });

  assert(result.validationErrors.length === 0, "credit_to_apply alias should pass");
  assert(result.summary.creditApplied === 500, "credit_to_apply should map to creditApplied");
  assert(result.summary.payableAmount === 300, "payableAmount should be 300");
}

function testPaymentMismatchShowsAmounts() {
  const result = quote({
    billDiscount: 1000,
    creditApplied: 500,
    items: [{ productId: "1", qty: 1, unitPrice: 1800, gstRate: 12, gstType: "inclusive" }],
    payments: [{ mode: "CASH", amount: 300 }],
  });

  // Simulate old behavior without bill discount applied
  const mismatch = quote({
    creditApplied: 500,
    items: [{ productId: "1", qty: 1, unitPrice: 1800, gstRate: 12, gstType: "inclusive" }],
    payments: [{ mode: "CASH", amount: 300 }],
  });

  assert(mismatch.validationErrors.length === 1, "Missing bill discount should fail payment validation");
  const detail = mismatch.validationErrors[0];
  assert(detail.field === "payments", "Error field should be payments");
  assert(detail.amount === 1300, `Expected amount 1300, got ${detail.amount}`);
  assert(detail.paymentTotal === 300, `Expected paymentTotal 300, got ${detail.paymentTotal}`);
  assert(detail.itemsTotal === 1800, `Expected itemsTotal 1800, got ${detail.itemsTotal}`);
  assert(detail.billDiscount === 0, `Expected billDiscount 0, got ${detail.billDiscount}`);
  assert(detail.grandTotal === 1800, `Expected grandTotal 1800, got ${detail.grandTotal}`);
  assert(detail.creditApplied === 500, `Expected creditApplied 500, got ${detail.creditApplied}`);
  assert(detail.difference === 1000, `Expected difference 1000, got ${detail.difference}`);
  assert(result.validationErrors.length === 0, "Valid bill discount payload should pass");
}

function testExclusiveBillDiscountBeforeGst() {
  const result = quote({
    billDiscount: 8900,
    items: [{ productId: "1772", qty: 1, unitPrice: 18000, gstRate: 5, gstType: "exclusive" }],
    payments: [{ mode: "CASH", amount: 9555 }],
  });

  assert(result.validationErrors.length === 0, `Expected no errors, got ${JSON.stringify(result.validationErrors)}`);
  assert(result.summary.discountableBase === 18900, "discountableBase should include GST for exclusive items");
  assert(result.summary.itemsTotal === 18900, "itemsTotal should include GST before bill discount");
  assert(result.summary.billDiscount === 8900, "billDiscount should be 8900");
  assert(result.summary.grandTotal === 9555, "grandTotal should apply bill discount before GST recalculation");
  assert(result.summary.totalGst === 455, "GST should be recalculated on discounted taxable amount");
  assert(result.summary.payableAmount === 9555, "payableAmount should be 9555");
}

function testMixedInclusiveExclusiveFullBillDiscount() {
  const result = quote({
    billDiscount: 15840,
    items: [
      { productId: "3445", qty: 1, unitPrice: 15000, gstRate: 18, gstType: "inclusive" },
      { productId: "2", qty: 1, unitPrice: 800, gstRate: 5, gstType: "exclusive" },
    ],
    payments: [],
  });

  assert(result.validationErrors.length === 0, `Expected no errors, got ${JSON.stringify(result.validationErrors)}`);
  assert(result.summary.discountableBase === 15840, "discountableBase should match customer-facing bill total");
  assert(result.summary.itemsTotal === 15840, "itemsTotal should be 15000 + 840");
  assert(result.summary.billDiscount === 15840, "full bill discount should apply");
  assert(result.summary.grandTotal === 0, "grandTotal should be zero after full discount");
}

function testLineItemShowsPreDiscountTotals() {
  const result = quote({
    billDiscount: 200,
    items: [{ productId: "355", qty: 2, unitPrice: 800, gstRate: 5, gstType: "exclusive" }],
    payments: [{ mode: "CASH", amount: 1470 }],
  });

  assert(result.validationErrors.length === 0, `Expected no errors, got ${JSON.stringify(result.validationErrors)}`);
  const line = result.lines[0];
  assert(line.lineTotal === 1680, `lineTotal should be 1680 before bill discount, got ${line.lineTotal}`);
  assert(line.grossAmount === 1600, `grossAmount should be 1600, got ${line.grossAmount}`);
  assert(line.taxableAmount === 1600, `taxableAmount should be 1600 before bill discount, got ${line.taxableAmount}`);
  assert(line.gstAmount === 80, `gstAmount should be 80 before bill discount, got ${line.gstAmount}`);
  assert(line.billDiscountShare === 200, `billDiscountShare should be 200, got ${line.billDiscountShare}`);
  assert(result.summary.itemsTotal === 1680, "itemsTotal should be pre-discount bill total");
  assert(result.summary.grandTotal === 1470, "grandTotal should be payable after bill discount");
  assert(result.summary.payableAmount === 1470, "payableAmount should be 1470");
}

function main() {
  testUserScenario();
  testNoBillDiscountRegression();
  testBillDiscountExceedsTotal();
  testCreditExceedsPayable();
  testSnakeCaseAlias();
  testSummaryBillDiscountFallback();
  testCreditToApplyAlias();
  testPaymentMismatchShowsAmounts();
  testExclusiveBillDiscountBeforeGst();
  testMixedInclusiveExclusiveFullBillDiscount();
  testLineItemShowsPreDiscountTotals();
  console.log("POS bill discount tests passed.");
}

main();
