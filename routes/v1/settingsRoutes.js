import express from "express";
import { VerifyToken, APIPermission } from "../../middleware/authmiddleware.js";
import { PERMISSIONS } from "../../config/permissionConfig.js";
import { getReceiptHtml, updateReceiptHtml } from "../../controllers/Admin/Settings/settingsController.js";

const router = express.Router();
router.get(
  "/receipt-html",
  VerifyToken,
  APIPermission(PERMISSIONS.POS_READ.name),
  getReceiptHtml
);

router.put(
  "/receipt-html",
  VerifyToken,
  APIPermission(PERMISSIONS.MASTER_UPDATE.name),
  updateReceiptHtml
);

export default router;