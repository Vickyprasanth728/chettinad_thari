import express from "express";
import { VerifyToken, APIPermission } from "../../middleware/authmiddleware.js";
import { PERMISSIONS } from "../../config/permissionConfig.js";
import { requireCrudIdQuery } from "../../middleware/requireCrudIdQuery.js";
import { requireRecordExists } from "../../middleware/requireRecordExists.js";
import {
  addVendor, getVendors, updateVendor, deleteVendor,
  checkUniqueCode, checkUniqueGst, getVendorDropdown,
  getVendorBalanceEndpoint, getAllVendorBalanceSummary,
} from "../../controllers/Admin/Vendor/vendorController.js";
import {
  addVendorOrder, getVendorOrders, updateVendorOrder, deleteVendorOrder,
  getVendorOrdersVendorsMap,
} from "../../controllers/Admin/Vendor/vendorOrderController.js";
import {
  addVendorPayment, getVendorPayments, updateVendorPayment, deleteVendorPayment,
} from "../../controllers/Admin/Vendor/vendorPaymentController.js";

const vendorRecord = requireRecordExists({
  table: "vendors",
  notFoundMessage: "Vendor not found",
});
const vendorOrderRecord = requireRecordExists({
  table: "vendor_orders",
  activeFilter: "status = 1",
  notFoundMessage: "Vendor order not found",
});
const vendorPaymentRecord = requireRecordExists({
  table: "vendor_payments",
  activeFilter: null,
  notFoundMessage: "Payment not found",
});

const router = express.Router();
router.post("/orders", VerifyToken, APIPermission(PERMISSIONS.VENDOR_ORDER_CREATE.name), addVendorOrder);
router.get("/orders/vendors-map", VerifyToken, APIPermission(PERMISSIONS.VENDOR_ORDER_READ.name), getVendorOrdersVendorsMap);
router.get("/orders/list", VerifyToken, APIPermission(PERMISSIONS.VENDOR_ORDER_READ.name), getVendorOrders);
router.put("/orders/:id", VerifyToken, APIPermission(PERMISSIONS.VENDOR_ORDER_UPDATE.name), vendorOrderRecord, updateVendorOrder);
router.delete("/orders/:id", VerifyToken, APIPermission(PERMISSIONS.VENDOR_ORDER_DELETE.name), vendorOrderRecord, deleteVendorOrder);

router.post("/payments", VerifyToken, APIPermission(PERMISSIONS.VENDOR_PAYMENT_CREATE.name), addVendorPayment);
router.get("/payments/list", VerifyToken, APIPermission(PERMISSIONS.VENDOR_PAYMENT_READ.name), getVendorPayments);
router.put("/payments/:id", VerifyToken, APIPermission(PERMISSIONS.VENDOR_PAYMENT_UPDATE.name), vendorPaymentRecord, updateVendorPayment);
router.delete("/payments/:id", VerifyToken, APIPermission(PERMISSIONS.VENDOR_PAYMENT_DELETE.name), vendorPaymentRecord, deleteVendorPayment);

router.post("/", VerifyToken, APIPermission(PERMISSIONS.VENDOR_CREATE.name), addVendor);
router.get("/", VerifyToken, APIPermission(PERMISSIONS.VENDOR_READ.name), getVendors);
router.get("/dropdown", VerifyToken, getVendorDropdown);
router.get("/balance-summary", VerifyToken, APIPermission(PERMISSIONS.VENDOR_READ.name), getAllVendorBalanceSummary);
router.get("/balance", VerifyToken, APIPermission(PERMISSIONS.VENDOR_READ.name), requireCrudIdQuery, getVendorBalanceEndpoint);
router.get("/:id/balance", VerifyToken, APIPermission(PERMISSIONS.VENDOR_READ.name), requireCrudIdQuery, getVendorBalanceEndpoint);
router.post("/check-unique-code", VerifyToken, checkUniqueCode);
router.post("/check-unique-gst", VerifyToken, checkUniqueGst);
router.put("/:id", VerifyToken, APIPermission(PERMISSIONS.VENDOR_UPDATE.name), vendorRecord, updateVendor);
router.delete("/:id", VerifyToken, APIPermission(PERMISSIONS.VENDOR_DELETE.name), vendorRecord, deleteVendor);

export default router;