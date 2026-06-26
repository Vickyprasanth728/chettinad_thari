import express from "express";
import { VerifyToken, APIPermission } from "../../middleware/authmiddleware.js";
import { PERMISSIONS } from "../../config/permissionConfig.js";
import { requireRecordExists } from "../../middleware/requireRecordExists.js";
import { AddGst, GetGst, UpdateGst, DeleteGst } from "../../controllers/Admin/GST/gstController.js";

const gstRecord = requireRecordExists({
  table: "gst",
  notFoundMessage: "GST not found",
});

const router = express.Router();
router.post("/", VerifyToken, APIPermission(PERMISSIONS.GST_CREATE.name), AddGst);
router.get("/", VerifyToken, APIPermission(PERMISSIONS.GST_READ.name), GetGst);
router.put("/:id", VerifyToken, APIPermission(PERMISSIONS.GST_UPDATE.name), gstRecord, UpdateGst);
router.delete("/:id", VerifyToken, APIPermission(PERMISSIONS.GST_DELETE.name), gstRecord, DeleteGst);

export default router;


