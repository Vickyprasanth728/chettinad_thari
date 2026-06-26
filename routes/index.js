import express from "express";
import authRoutes from "./v1/authRoutes.js";
import usersRoutes from "./v1/usersRoutes.js";
import rolesRoutes from "./v1/rolesRoutes.js";
import permissionsRoutes from "./v1/permissionsRoutes.js";
import sidebarRoutes from "./v1/sidebarRoutes.js";
import masterRoutes from "./v1/masterRoutes.js";
import gstRoutes from "./v1/gstRoutes.js";
import categoryRoutes from "./v1/categoryRoutes.js";
import vendorRoutes from "./v1/vendorRoutes.js";
import productRoutes from "./v1/productRoutes.js";
import posRoutes from "./v1/posRoutes.js";
import posAppRoutes from "./v1/posAppRoutes.js";
import dashboardRoutes from "./v1/dashboardRoutes.js";
import reportRoutes from "./v1/reportRoutes.js";
import gstReportRoutes from "./v1/gstReportRoutes.js";
import settingsRoutes from "./v1/settingsRoutes.js";

const router = express.Router();

router.use("/v1/auth", authRoutes);
router.use("/v1/users", usersRoutes);
router.use("/v1/roles", rolesRoutes);
router.use("/v1/permissions", permissionsRoutes);
router.use("/v1/sidebar", sidebarRoutes);
router.use("/v1/gst", gstRoutes);
router.use("/v1/categories", categoryRoutes);
router.use("/v1/vendors", vendorRoutes);
router.use("/v1/products", productRoutes);
router.use("/v1", posAppRoutes);
router.use("/v1/pos", posRoutes);
router.use("/v1/dashboard", dashboardRoutes);
router.use("/v1/reports", reportRoutes);
router.use("/v1/gst-reports", gstReportRoutes);
router.use("/v1/settings", settingsRoutes);
// Generic master CRUD last — /:table would otherwise steal /products, /gst, etc.
router.use("/v1", masterRoutes);

export default router;

