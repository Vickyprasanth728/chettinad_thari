import express from "express";
import { VerifyToken, APIPermission } from "../../middleware/authmiddleware.js";
import { PERMISSIONS } from "../../config/permissionConfig.js";
import { requireRecordExists } from "../../middleware/requireRecordExists.js";
import {
  getPermissions, addPermission, updatePermission, deletePermission,
} from "../../controllers/Admin/Permissions/permissionsController.js";

const permissionRecord = requireRecordExists({
  table: "permissions",
  activeFilter: "status = 1",
  notFoundMessage: "Permission not found",
});

const router = express.Router();
router.get("/", VerifyToken, APIPermission(PERMISSIONS.PERMISSIONS_READ.name), getPermissions);
router.post("/", VerifyToken, APIPermission(PERMISSIONS.PERMISSIONS_CREATE.name), addPermission);
router.put("/:id", VerifyToken, APIPermission(PERMISSIONS.PERMISSIONS_UPDATE.name), permissionRecord, updatePermission);
router.delete("/:id", VerifyToken, APIPermission(PERMISSIONS.PERMISSIONS_DELETE.name), permissionRecord, deletePermission);
export default router;