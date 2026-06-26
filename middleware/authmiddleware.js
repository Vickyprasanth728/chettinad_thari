import { db } from "../config/Database.js";
import { PERMISSIONS } from "../config/permissionConfig.js";
import { verifyAccessToken } from "../Utils/authTokens.js";
import { validateEnv } from "../config/env.js";

const { isProduction } = validateEnv();

/**
 * Roles seeded before category permissions existed may only have master:*.
 * Treat master permissions as covering matching category/design/gst routes in admin.
 */
const PERMISSION_ALIASES = {
  "category:read": ["master:read"],
  "category:create": ["master:create", "master:read"],
  "category:update": ["master:update", "master:read"],
  "category:delete": ["master:delete", "master:read"],
  "design:read": ["master:read"],
  "design:create": ["master:create", "master:read"],
  "design:update": ["master:update", "master:read"],
  "design:delete": ["master:delete", "master:read"],
  "gst:read": ["master:read"],
  "gst:create": ["master:create", "master:read"],
  "gst:update": ["master:update", "master:read"],
  "gst:delete": ["master:delete", "master:read"],
};

function roleHasPermission(allowedNames, permissionName) {
  if (allowedNames.includes(permissionName)) return true;
  const aliases = PERMISSION_ALIASES[permissionName] || [];
  return aliases.some((name) => allowedNames.includes(name));
}

export async function VerifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({
      status: false,
      message: "Access denied. Token not provided.",
      code: "AUTH_TOKEN_MISSING",
    });
  }

  try {
    const token = authHeader.split(" ")[1];
    const decoded = verifyAccessToken(token);

    if (decoded.type !== "access") {
      return res.status(401).json({
        status: false,
        message: "Invalid token type",
        code: "AUTH_INVALID_TOKEN_TYPE",
      });
    }

    const [[user]] = await db.query(
      `SELECT u.*, r.name AS role_name FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.id = ? AND u.status != 0 LIMIT 1`,
      { replacements: [decoded.userId] }
    );

    if (!user) {
      return res.status(401).json({
        status: false,
        message: "User not found or inactive",
        code: "AUTH_USER_INACTIVE",
      });
    }

    if (user.username !== decoded.username || user.role_id !== decoded.roleId) {
      return res.status(401).json({
        status: false,
        message: "Token no longer valid. Please sign in again.",
        code: "AUTH_TOKEN_STALE",
      });
    }

    req.user = { ...user, role: user.role_id };
    req.token = decoded;
    next();
  } catch (error) {
    const isExpired = error.name === "TokenExpiredError";
    return res.status(401).json({
      status: false,
      message: isExpired ? "Session expired. Please sign in again." : "Not authorized",
      code: isExpired ? "AUTH_TOKEN_EXPIRED" : "AUTH_TOKEN_INVALID",
      ...(!isProduction && { error: error.message }),
    });
  }
}

export const APIPermission = (permissionName) => {
  return async (req, res, next) => {
    try {
      const permission = Object.values(PERMISSIONS).find((p) => p.name === permissionName);
      if (!permission) {
        return res.status(403).json({
          status: false,
          message: `Invalid permission: ${permissionName}`,
          code: "PERMISSION_UNKNOWN",
        });
      }

      const [rows] = await db.query(
        `SELECT p.name FROM rolepermission rp
         JOIN permissions p ON p.id = rp.permission_id
         WHERE rp.role_id = ? AND p.status = 1`,
        { replacements: [req.user.role_id] }
      );

      const allowed = rows.map((r) => r.name);
      if (!roleHasPermission(allowed, permissionName)) {
        return res.status(403).json({
          status: false,
          message: `Access denied. Missing permission: ${permissionName}`,
          code: "PERMISSION_DENIED",
        });
      }
      next();
    } catch (err) {
      return res.status(500).json({
        status: false,
        message: isProduction ? "Internal server error" : err.message,
        code: "INTERNAL_ERROR",
      });
    }
  };
};
