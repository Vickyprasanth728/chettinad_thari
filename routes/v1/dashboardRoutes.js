import express from "express";
import { VerifyToken, APIPermission } from "../../middleware/authmiddleware.js";
import { PERMISSIONS } from "../../config/permissionConfig.js";
import {
  getDashboardSummary, getLowStock, getSalesChart,
} from "../../controllers/Admin/Dashboard/dashboardController.js";

const router = express.Router();
router.get("/summary", VerifyToken, APIPermission(PERMISSIONS.DASHBOARD_READ.name), getDashboardSummary);
router.get("/low-stock", VerifyToken, APIPermission(PERMISSIONS.DASHBOARD_READ.name), getLowStock);
router.get("/sales-chart", VerifyToken, APIPermission(PERMISSIONS.DASHBOARD_READ.name), getSalesChart);
export default router;