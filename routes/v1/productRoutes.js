import express from "express";
import { VerifyToken, APIPermission } from "../../middleware/authmiddleware.js";
import { PERMISSIONS } from "../../config/permissionConfig.js";
import { requireCrudIdQuery } from "../../middleware/requireCrudIdQuery.js";
import { requireRecordExists } from "../../middleware/requireRecordExists.js";
import { posSearchProducts, posOutOfStockProducts } from "../../controllers/POS/posAppController.js";
import {
  addProduct, getProducts, getProductStats, getStockNumbers, updateProduct, deleteProduct,
  adjustStock, getInventoryLogs, getByStockNo, qrScan, getQrTag,
  checkStatus, checkQuantity, checkProductNameUnique, bulkUpload, downloadBulkTemplate,
  getPosProducts, upload, uploadProductImage, deleteProductImageHandler, productImageUpload,
} from "../../controllers/Admin/Product/productController.js";

const productRecord = requireRecordExists({
  table: "products",
  notFoundMessage: "Product not found",
});

const router = express.Router();
router.get("/pos-catalog", VerifyToken, APIPermission(PERMISSIONS.POS_READ.name), getPosProducts);
router.get("/out-of-stock", VerifyToken, APIPermission(PERMISSIONS.POS_READ.name), posOutOfStockProducts);
router.get("/search", VerifyToken, APIPermission(PERMISSIONS.POS_READ.name), posSearchProducts);
router.post("/bulk-upload", VerifyToken, APIPermission(PERMISSIONS.BULK_UPLOAD.name), upload.single("file"), bulkUpload);
router.get(
  "/bulk-upload/template",
  VerifyToken,
  APIPermission(PERMISSIONS.BULK_UPLOAD.name),
  downloadBulkTemplate
);
router.post("/checkstatus", checkStatus);
router.post("/check-quantity", VerifyToken, APIPermission(PERMISSIONS.POS_CHECK_QUANTITY.name), checkQuantity);
router.post(
  "/check-unique-name",
  VerifyToken,
  APIPermission(PERMISSIONS.PRODUCT_READ.name),
  checkProductNameUnique
);
router.post("/qr-scan", VerifyToken, APIPermission(PERMISSIONS.QR_READ.name), qrScan);

router.post("/", VerifyToken, APIPermission(PERMISSIONS.PRODUCT_CREATE.name), addProduct);
router.get("/stats", VerifyToken, APIPermission(PERMISSIONS.PRODUCT_READ.name), getProductStats);
router.get("/stock-numbers", VerifyToken, APIPermission(PERMISSIONS.PRODUCT_READ.name), getStockNumbers);
router.get("/inventory-logs", VerifyToken, requireCrudIdQuery, getInventoryLogs);
router.get("/qr-tag", VerifyToken, APIPermission(PERMISSIONS.QR_READ.name), getQrTag);
router.get("/", VerifyToken, APIPermission(PERMISSIONS.PRODUCT_READ.name), getProducts);
router.get("/by-stock/:stockNo", VerifyToken, getByStockNo);
router.post(
  "/:id/images",
  VerifyToken,
  APIPermission(PERMISSIONS.PRODUCT_UPDATE.name),
  productRecord,
  productImageUpload.single("image"),
  uploadProductImage
);
router.delete(
  "/:id/images/:imageId",
  VerifyToken,
  APIPermission(PERMISSIONS.PRODUCT_UPDATE.name),
  productRecord,
  deleteProductImageHandler
);
router.put("/:id", VerifyToken, APIPermission(PERMISSIONS.PRODUCT_UPDATE.name), productRecord, updateProduct);
router.post("/:id/adjust-stock", VerifyToken, APIPermission(PERMISSIONS.INVENTORY_ADJUST.name), productRecord, adjustStock);
router.delete("/:id", VerifyToken, APIPermission(PERMISSIONS.PRODUCT_DELETE.name), productRecord, deleteProduct);

export default router;