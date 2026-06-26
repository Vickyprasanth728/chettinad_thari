import express from "express";
import { VerifyToken, APIPermission } from "../../middleware/authmiddleware.js";
import { PERMISSIONS } from "../../config/permissionConfig.js";
import { requireRecordExists } from "../../middleware/requireRecordExists.js";
import {
  addCategory,
  getCategories,
  updateCategory,
  deleteCategory,
  getCategoryDropdown,
  checkCategoryNameUnique,
} from "../../controllers/Admin/Category/categoryController.js";

const categoryRecord = requireRecordExists({
  table: "product_categories",
  notFoundMessage: "Category not found",
});

const router = express.Router();
router.get("/dropdown", VerifyToken, APIPermission(PERMISSIONS.CATEGORY_READ.name), getCategoryDropdown);
router.post("/check-unique-name", VerifyToken, APIPermission(PERMISSIONS.CATEGORY_READ.name), checkCategoryNameUnique);

router.post("/", VerifyToken, APIPermission(PERMISSIONS.CATEGORY_CREATE.name), addCategory);
router.get("/", VerifyToken, APIPermission(PERMISSIONS.CATEGORY_READ.name), getCategories);
router.put("/:id", VerifyToken, APIPermission(PERMISSIONS.CATEGORY_UPDATE.name), categoryRecord, updateCategory);
router.delete("/:id", VerifyToken, APIPermission(PERMISSIONS.CATEGORY_DELETE.name), categoryRecord, deleteCategory);

export default router;