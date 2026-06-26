import express from "express";
import { VerifyToken, APIPermission } from "../../middleware/authmiddleware.js";
import { PERMISSIONS } from "../../config/permissionConfig.js";
import { requireRecordExists } from "../../middleware/requireRecordExists.js";
import {
  getSidebar, addSidebar, updateSidebar, deleteSidebar,
} from "../../controllers/Admin/Sidebar/sidebarController.js";

const sidebarRecord = requireRecordExists({
  table: "sidebar",
  activeFilter: "status = 1",
  notFoundMessage: "Sidebar item not found",
});

const router = express.Router();
router.get("/", VerifyToken, APIPermission(PERMISSIONS.SIDEBAR_READ.name), getSidebar);
router.post("/", VerifyToken, APIPermission(PERMISSIONS.SIDEBAR_CREATE.name), addSidebar);
router.put("/:id", VerifyToken, APIPermission(PERMISSIONS.SIDEBAR_UPDATE.name), sidebarRecord, updateSidebar);
router.delete("/:id", VerifyToken, APIPermission(PERMISSIONS.SIDEBAR_DELETE.name), sidebarRecord, deleteSidebar);
export default router;