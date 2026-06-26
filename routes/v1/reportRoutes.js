import express from "express";
import { VerifyToken, APIPermission } from "../../middleware/authmiddleware.js";
import { PERMISSIONS } from "../../config/permissionConfig.js";
import {
  vendorReport, inDepthReport, billDetailsReport, cancelledBillsReport, dailyReport,
  reportFilterProducts, reportFilterStaff, reportFilterPaymentTypes, reportFilterVendors,
} from "../../controllers/Admin/Reports/reportsController.js";

const router = express.Router();
router.get("/vendor", VerifyToken, APIPermission(PERMISSIONS.REPORT_READ.name), vendorReport);
router.get("/in-depth", VerifyToken, APIPermission(PERMISSIONS.REPORT_READ.name), inDepthReport);
router.get("/bill-details", VerifyToken, APIPermission(PERMISSIONS.REPORT_READ.name), billDetailsReport);
router.get("/cancelled-bills", VerifyToken, APIPermission(PERMISSIONS.REPORT_READ.name), cancelledBillsReport);
router.get("/daily", VerifyToken, APIPermission(PERMISSIONS.REPORT_READ.name), dailyReport);
router.get("/filters/vendors", VerifyToken, reportFilterVendors);
router.get("/filters/products", VerifyToken, reportFilterProducts);
router.get("/filters/staff", VerifyToken, reportFilterStaff);
router.get("/filters/payment-types", VerifyToken, reportFilterPaymentTypes);
export default router;