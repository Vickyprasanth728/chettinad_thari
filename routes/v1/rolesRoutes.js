import express from "express";
import { VerifyToken, APIPermission } from "../../middleware/authmiddleware.js";
import { PERMISSIONS } from "../../config/permissionConfig.js";
import { requireRecordExists } from "../../middleware/requireRecordExists.js";
import { AddRole, GetRoles, UpdateRole, DeleteRole } from "../../controllers/Admin/Roles/rolesController.js";

const roleRecord = requireRecordExists({
  table: "roles",
  notFoundMessage: "Role not found",
});

const router = express.Router();
router.post("/", VerifyToken, APIPermission(PERMISSIONS.ROLES_CREATE.name), AddRole);
router.get("/", VerifyToken, APIPermission(PERMISSIONS.ROLES_READ.name), GetRoles);
router.put("/:id", VerifyToken, APIPermission(PERMISSIONS.ROLES_UPDATE.name), roleRecord, UpdateRole);
router.delete("/:id", VerifyToken, APIPermission(PERMISSIONS.ROLES_DELETE.name), roleRecord, DeleteRole);
export default router;