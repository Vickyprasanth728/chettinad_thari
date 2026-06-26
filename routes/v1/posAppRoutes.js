import express from "express";
import { VerifyToken, APIPermission } from "../../middleware/authmiddleware.js";
import { PERMISSIONS } from "../../config/permissionConfig.js";
import {
  posQuoteBilling,
  posNextBillNo,
  posCheckoutBilling,
  posGetBill,
  posQuoteReturn,
  posCheckoutReturn,
  posQuoteCancelBill,
  posCheckoutCancelBill,
  posSearchCustomers,
  posCreditWallet,
  posApplyWallet,
  posCheckBillingStock,
  posReportDaily,
  posReportGst,
  posReportPayments,
} from "../../controllers/POS/posAppController.js";

const router = express.Router();
const billing = APIPermission(PERMISSIONS.POS_BILLING.name);
const read = APIPermission(PERMISSIONS.POS_READ.name);
const ret = APIPermission(PERMISSIONS.POS_RETURN.name);
const cancel = APIPermission(PERMISSIONS.POS_CANCEL.name);
const credit = APIPermission(PERMISSIONS.CREDIT_READ.name);

router.post("/billing/quote", VerifyToken, billing, posQuoteBilling);
router.post("/billing/check-stock", VerifyToken, billing, posCheckBillingStock);
router.get("/billing/next-bill-no", VerifyToken, billing, posNextBillNo);
router.post("/billing/checkout", VerifyToken, billing, posCheckoutBilling);
router.get("/billing/:billNo", VerifyToken, read, posGetBill);

router.post("/returns/quote", VerifyToken, ret, posQuoteReturn);
router.post("/returns/checkout", VerifyToken, ret, posCheckoutReturn);

router.post("/cancel/quote", VerifyToken, cancel, posQuoteCancelBill);
router.post("/cancel/checkout", VerifyToken, cancel, posCheckoutCancelBill);

router.get("/customers/search", VerifyToken, read, posSearchCustomers);
router.get("/customers/:customerId/credit-wallet", VerifyToken, credit, posCreditWallet);
router.post("/customers/:customerId/credit-wallet/apply", VerifyToken, credit, posApplyWallet);

router.post("/reports/daily-summary", VerifyToken, read, posReportDaily);
router.post("/reports/gst-summary", VerifyToken, read, posReportGst);
router.post("/reports/payment-modes", VerifyToken, read, posReportPayments);

export default router;