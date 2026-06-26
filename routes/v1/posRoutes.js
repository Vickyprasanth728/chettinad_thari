import express from "express";
import { VerifyToken, APIPermission } from "../../middleware/authmiddleware.js";
import { PERMISSIONS } from "../../config/permissionConfig.js";
import {
  getPosInit, previewBillNumber, checkBillingQuantity, insertBilling,
  listBills, getBill, getInvoicePdf, printReceipt,
} from "../../controllers/POS/billingController.js";
import {
  createReturn, listReturns, listCreditWallets, getReturn, getBillReturns, cancelBill,
  listCancellations, getCancellation,
  getCreditBalance, getCreditHistory, adjustCredit,
} from "../../controllers/POS/returnController.js";

const router = express.Router();
router.get("/init", VerifyToken, APIPermission(PERMISSIONS.POS_BILLING.name), getPosInit);
router.get("/bill-number", VerifyToken, APIPermission(PERMISSIONS.POS_BILL_NUMBER.name), previewBillNumber);
router.post("/check-quantity", VerifyToken, APIPermission(PERMISSIONS.POS_CHECK_QUANTITY.name), checkBillingQuantity);
router.post("/billing", VerifyToken, APIPermission(PERMISSIONS.POS_BILLING.name), insertBilling);
router.get("/bills", VerifyToken, APIPermission(PERMISSIONS.POS_READ.name), listBills);
router.get("/bills/:billId", VerifyToken, APIPermission(PERMISSIONS.POS_READ.name), getBill);
router.get("/bills/:billId/print-receipt", VerifyToken, APIPermission(PERMISSIONS.POS_READ.name), printReceipt);
router.get("/bills/:billId/invoice-pdf", VerifyToken, APIPermission(PERMISSIONS.POS_READ.name), getInvoicePdf);

router.post("/return", VerifyToken, APIPermission(PERMISSIONS.POS_RETURN.name), createReturn);
router.get("/returns", VerifyToken, APIPermission(PERMISSIONS.POS_RETURN.name), listReturns);
router.get("/returns/:id", VerifyToken, APIPermission(PERMISSIONS.POS_RETURN.name), getReturn);
router.get("/cancel", VerifyToken, APIPermission(PERMISSIONS.POS_CANCEL.name), listCancellations);
router.get("/cancel/:id", VerifyToken, APIPermission(PERMISSIONS.POS_CANCEL.name), getCancellation);
router.get("/credit-wallets", VerifyToken, APIPermission(PERMISSIONS.CREDIT_READ.name), listCreditWallets);
router.get("/bills/:billId/returns", VerifyToken, APIPermission(PERMISSIONS.POS_RETURN.name), getBillReturns);
router.post("/cancel-bill", VerifyToken, APIPermission(PERMISSIONS.POS_CANCEL.name), cancelBill);

router.get("/customers/:customerId/credit-balance", VerifyToken, APIPermission(PERMISSIONS.CREDIT_READ.name), getCreditBalance);
router.get("/customers/:customerId/credit-history", VerifyToken, APIPermission(PERMISSIONS.CREDIT_READ.name), getCreditHistory);
router.post("/customers/credit/adjust", VerifyToken, APIPermission(PERMISSIONS.CREDIT_ADJUST.name), adjustCredit);

export default router;