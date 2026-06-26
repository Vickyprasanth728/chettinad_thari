import express from "express";
import { VerifyToken, APIPermission } from "../../middleware/authmiddleware.js";
import { PERMISSIONS } from "../../config/permissionConfig.js";
import { PrecheckMiddleware, GetCheckMiddleware } from "../../middleware/preCheck.js";
import {
  handleAdd, handleGet, handleUpdate, handleDelete, checkDesignCodeUnique, checkMasterFieldUnique,
} from "../../controllers/Admin/Masters/mastersController.js";

const router = express.Router();
router.post("/design/check-unique-code", VerifyToken, checkDesignCodeUnique);
router.post("/:table/check-unique", VerifyToken, APIPermission(PERMISSIONS.MASTER_READ.name), checkMasterFieldUnique);
router.post("/:table", VerifyToken, APIPermission(PERMISSIONS.MASTER_CREATE.name), PrecheckMiddleware, handleAdd);
router.get("/:table", VerifyToken, APIPermission(PERMISSIONS.MASTER_READ.name), GetCheckMiddleware, handleGet);
router.put("/:table/:id", VerifyToken, APIPermission(PERMISSIONS.MASTER_UPDATE.name), PrecheckMiddleware, handleUpdate);
router.delete("/:table/:id", VerifyToken, APIPermission(PERMISSIONS.MASTER_DELETE.name), GetCheckMiddleware, handleDelete);
export default router;