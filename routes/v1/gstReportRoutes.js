import express from "express";
import { VerifyToken, APIPermission } from "../../middleware/authmiddleware.js";
import { PERMISSIONS } from "../../config/permissionConfig.js";
import {
  gstSummaryReport,
  gstDetailedReport,
  gstReconciliationReport,
  gstSalesReport,
  gstPurchaseReport,
  hsnSummaryReport,
  combinedGstReport,
} from "../../controllers/Admin/GSTReports/gstReportsController.js";

const router = express.Router();
router.get("/summary", VerifyToken, APIPermission(PERMISSIONS.GST_REPORT_READ.name), gstSummaryReport);
router.get("/detailed", VerifyToken, APIPermission(PERMISSIONS.GST_REPORT_READ.name), gstDetailedReport);
router.get("/reconciliation", VerifyToken, APIPermission(PERMISSIONS.GST_REPORT_READ.name), gstReconciliationReport);
router.get("/sales", VerifyToken, APIPermission(PERMISSIONS.GST_REPORT_READ.name), gstSalesReport);
router.get("/purchase", VerifyToken, APIPermission(PERMISSIONS.GST_REPORT_READ.name), gstPurchaseReport);
router.get("/hsn-summary", VerifyToken, APIPermission(PERMISSIONS.GST_REPORT_READ.name), hsnSummaryReport);
router.get("/combined", VerifyToken, APIPermission(PERMISSIONS.GST_REPORT_EXPORT.name), combinedGstReport);
export default router;