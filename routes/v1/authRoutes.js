import express from "express";
import {
  login, refreshToken, signout, me, forgotPassword, resetPassword,
} from "../../controllers/Admin/Auth/authController.js";
import { VerifyToken } from "../../middleware/authmiddleware.js";
import {
  validateSignin, validateRefreshToken, validateForgotPassword, validateResetPassword,
} from "../../middleware/validateAuth.js";
import {
  authRateLimiter, refreshRateLimiter, forgotPasswordRateLimiter,
} from "../../middleware/rateLimiter.js";

const router = express.Router();

router.post("/signin", authRateLimiter, validateSignin, login);
router.post("/forgot-password", forgotPasswordRateLimiter, validateForgotPassword, forgotPassword);
router.post("/reset-password", authRateLimiter, validateResetPassword, resetPassword);
router.post("/refresh-token", refreshRateLimiter, validateRefreshToken, refreshToken);
router.post("/signout", VerifyToken, signout);
router.get("/me", VerifyToken, me);

export default router;
