import express from "express";
import { VerifyToken, APIPermission } from "../../middleware/authmiddleware.js";
import { PERMISSIONS } from "../../config/permissionConfig.js";
import { requireRecordExists } from "../../middleware/requireRecordExists.js";
import {
  AddUser, GetUsers, UpdateUser, DeleteUser,
  checkUsernameUnique, checkMobileUnique, checkEmailUnique, getStaffList,
} from "../../controllers/Admin/Users/usersController.js";

const userRecord = requireRecordExists({
  table: "users",
  notFoundMessage: "User not found",
});

const router = express.Router();
router.post("/", VerifyToken, APIPermission(PERMISSIONS.USER_CREATE.name), AddUser);
router.get("/", VerifyToken, APIPermission(PERMISSIONS.USER_READ.name), GetUsers);
router.get("/staff-list", VerifyToken, getStaffList);
router.put("/:id", VerifyToken, APIPermission(PERMISSIONS.USER_UPDATE.name), userRecord, UpdateUser);
router.delete("/:id", VerifyToken, APIPermission(PERMISSIONS.USER_DELETE.name), userRecord, DeleteUser);
router.post("/username-unique", checkUsernameUnique);
router.post("/mobile-unique", checkMobileUnique);
router.post("/email-unique", checkEmailUnique);
export default router;