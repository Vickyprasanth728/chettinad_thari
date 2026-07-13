import bcrypt from "bcrypt";
import { db, setSessionDefaults } from "../../../config/Database.js";
import { getCurrentISTTime } from "../../../Utils/Datetime.js";
import { logInfo, logError } from "../../../logs/LogController.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  getTokenExpirySeconds,
  authEnv,
} from "../../../Utils/authTokens.js";
import { validateEnv } from "../../../config/env.js";
import {
  normalizeEmail,
  createPasswordResetToken,
  findValidResetToken,
  markResetTokenUsed,
  clearUserSessions,
} from "../../../Utils/passwordResetHelper.js";
import { sendPasswordResetEmail } from "../../../Utils/mailService.js";

const CLIENT = process.env.CLIENT || "CHETTINAD";
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const INVALID_CREDENTIALS_MSG = "Invalid username or password";

// Precomputed hash — used when user does not exist to reduce timing attacks
const DUMMY_PASSWORD_HASH =
  "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYqJqF5Q5eO";

const { isProduction, bcryptRounds, frontendUrl } = validateEnv();

const FORGOT_PASSWORD_SUCCESS_MSG =
  "Password reset link has been sent to your registered email.";

function normalizeUsername(username) {
  return String(username).trim().toLowerCase();
}

function buildAuthPayload(user) {
  return {
    userId: user.userid,
    roleId: user.role_id,
    username: user.username,
  };
}

function setRefreshTokenCookie(res, refreshToken) {
  if (!authEnv.useRefreshCookie) return;
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: authEnv.cookieSecure,
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/api/v1/auth",
  });
}

function clearRefreshTokenCookie(res) {
  if (!authEnv.useRefreshCookie) return;
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: authEnv.cookieSecure,
    sameSite: "strict",
    path: "/api/v1/auth",
  });
}

async function loadUserAuthData(username) {
  const [rows] = await db.query(
    `SELECT u.id AS userid, u.role_id, u.password, u.username, u.name,
            GROUP_CONCAT(DISTINCT p.name ORDER BY p.id) AS permission_names,
            GROUP_CONCAT(DISTINCT p.id ORDER BY p.id) AS permission_ids,
            r.name AS role_name
     FROM users u
     LEFT JOIN roles r ON r.id = u.role_id
     LEFT JOIN rolepermission rp ON rp.role_id = u.role_id
     LEFT JOIN permissions p ON p.id = rp.permission_id AND p.status = 1
     WHERE u.username = ? AND u.status != 0
     GROUP BY u.id`,
    { replacements: [username] }
  );
  return rows[0];
}

async function loadSidebar(roleId) {
  const [sidebar] = await db.query(
    `SELECT DISTINCT s.id, s.name, s.path, s.icon, s.permission, s.parent_permission
     FROM sidebar s
     INNER JOIN rolepermission rp ON s.permission = rp.permission_id
     WHERE s.status = 1 AND rp.role_id = ?
     ORDER BY s.id`,
    { replacements: [roleId] }
  );
  return sidebar;
}

function parsePermissions(data) {
  const permissions = [];
  if (data?.permission_ids && data?.permission_names) {
    const ids = data.permission_ids.split(",");
    const names = data.permission_names.split(",");
    ids.forEach((id, i) => {
      if (id && names[i]) permissions.push({ id: parseInt(id, 10), name: names[i] });
    });
  }
  return permissions;
}

async function recordFailedAttempt(username, userId = null) {
  if (!userId) return;
  await db.query(
    `INSERT INTO user_status (userid, username, loginAttempts)
     VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE loginAttempts = loginAttempts + 1`,
    { replacements: [userId, username] }
  );
  const [[st]] = await db.query(
    `SELECT loginAttempts FROM user_status WHERE username = ?`,
    { replacements: [username] }
  );
  if (st?.loginAttempts >= MAX_ATTEMPTS) {
    await db.query(
      `UPDATE user_status SET loginBlockedUntil = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE username = ?`,
      { replacements: [LOCK_MINUTES, username] }
    );
  }
}

export const login = async (req, res) => {
  try {
    await setSessionDefaults();
    const username = normalizeUsername(req.body.username);
    const { password } = req.body;

    const [[blocked]] = await db.query(
      `SELECT loginBlockedUntil FROM user_status WHERE username = ?`,
      { replacements: [username] }
    );
    if (blocked?.loginBlockedUntil && new Date(blocked.loginBlockedUntil) > new Date()) {
      return res.status(423).json({
        status: false,
        message: "Account temporarily locked due to multiple failed attempts. Try again later.",
        code: "AUTH_ACCOUNT_LOCKED",
      });
    }

    const data = await loadUserAuthData(username);
    const passwordHash = data?.password || DUMMY_PASSWORD_HASH;
    const passwordValid = await bcrypt.compare(password, passwordHash);

    if (!data || !passwordValid) {
      if (data) await recordFailedAttempt(username, data.userid);
      return res.status(401).json({
        status: false,
        message: INVALID_CREDENTIALS_MSG,
        code: "AUTH_INVALID_CREDENTIALS",
      });
    }

    const queryTime = await getCurrentISTTime();
    await db.query(`INSERT INTO userlog (userid, lastlogin) VALUES (?, ?)`, {
      replacements: [data.userid, queryTime],
    });

    const payload = buildAuthPayload(data);
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    await db.query(
      `INSERT INTO user_status (userid, username, loginAttempts, refresh_token, loginBlockedUntil)
       VALUES (?, ?, 0, ?, NULL)
       ON DUPLICATE KEY UPDATE loginAttempts = 0, refresh_token = ?, loginBlockedUntil = NULL`,
      { replacements: [data.userid, username, refreshToken, refreshToken] }
    );

    const permissions = parsePermissions(data);
    const sidebar = await loadSidebar(data.role_id);

    setRefreshTokenCookie(res, refreshToken);
    logInfo(`User ${username} signed in from IP ${req.ip}`, "auth.login");

    return res.status(200).json({
      status: true,
      message: "Login successful",
      data: {
        accessToken,
        refreshToken,
        tokenType: "Bearer",
        expiresIn: getTokenExpirySeconds(authEnv.accessTokenExpiry),
        client: CLIENT,
        user: {
          id: data.userid,
          username: data.username,
          name: data.name || data.username,
          role_id: data.role_id,
          role_name: data.role_name,
        },
        permissions,
        sidebar,
      },
    });
  } catch (error) {
    logError(error, "auth.login");
    return res.status(500).json({
      status: false,
      message: isProduction ? "Unable to sign in. Please try again." : error.message,
      code: "INTERNAL_ERROR",
    });
  }
};

export const refreshToken = async (req, res) => {
  try {
    const tokenFromBody = req.body.refreshToken;
    const tokenFromCookie = req.cookies?.refreshToken;
    const refreshTokenValue = tokenFromBody || tokenFromCookie;
    const { userid } = req.body;

    if (!refreshTokenValue || !userid) {
      return res.status(401).json({
        status: false,
        message: "Refresh token and user id are required",
        code: "AUTH_REFRESH_MISSING",
      });
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshTokenValue);
    } catch {
      return res.status(401).json({
        status: false,
        message: "Invalid or expired refresh token",
        code: "AUTH_REFRESH_INVALID",
      });
    }

    if (decoded.type !== "refresh") {
      return res.status(401).json({
        status: false,
        message: "Invalid refresh token",
        code: "AUTH_INVALID_TOKEN_TYPE",
      });
    }

    if (Number(decoded.userId) !== Number(userid)) {
      return res.status(401).json({
        status: false,
        message: "Refresh token does not match user",
        code: "AUTH_REFRESH_MISMATCH",
      });
    }

    const [[stored]] = await db.query(
      `SELECT refresh_token FROM user_status WHERE userid = ?`,
      { replacements: [userid] }
    );

    if (!stored?.refresh_token || stored.refresh_token !== refreshTokenValue) {
      return res.status(401).json({
        status: false,
        message: "Refresh token revoked or invalid",
        code: "AUTH_REFRESH_REVOKED",
      });
    }

    const [[user]] = await db.query(
      `SELECT id AS userid, role_id, username, status FROM users WHERE id = ? LIMIT 1`,
      { replacements: [userid] }
    );

    if (!user || user.status === 0) {
      return res.status(401).json({
        status: false,
        message: "User not found or inactive",
        code: "AUTH_USER_INACTIVE",
      });
    }

    const payload = {
      userId: user.userid,
      roleId: user.role_id,
      username: user.username,
    };

    const accessToken = signAccessToken(payload);
    const newRefreshToken = signRefreshToken(payload);

    await db.query(`UPDATE user_status SET refresh_token = ? WHERE userid = ?`, {
      replacements: [newRefreshToken, userid],
    });

    setRefreshTokenCookie(res, newRefreshToken);

    return res.status(200).json({
      status: true,
      message: "Token refreshed",
      data: {
        accessToken,
        refreshToken: newRefreshToken,
        tokenType: "Bearer",
        expiresIn: getTokenExpirySeconds(authEnv.accessTokenExpiry),
      },
    });
  } catch (error) {
    logError(error, "auth.refresh");
    return res.status(500).json({
      status: false,
      message: isProduction ? "Unable to refresh session." : error.message,
      code: "INTERNAL_ERROR",
    });
  }
};

export const signout = async (req, res) => {
  try {
    if (req.user?.id) {
      await db.query(
        `UPDATE userlog SET logout = NOW()
         WHERE userid = ? AND id = (SELECT max_id FROM (SELECT MAX(id) AS max_id FROM userlog WHERE userid = ?) t)`,
        { replacements: [req.user.id, req.user.id] }
      );
      await db.query(`UPDATE user_status SET refresh_token = NULL WHERE userid = ?`, {
        replacements: [req.user.id],
      });
    }
    clearRefreshTokenCookie(res);
    return res.status(200).json({
      status: true,
      message: "Signed out successfully",
    });
  } catch (error) {
    logError(error, "auth.signout");
    return res.status(500).json({
      status: false,
      message: isProduction ? "Unable to sign out." : error.message,
      code: "INTERNAL_ERROR",
    });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    await setSessionDefaults();
    const email = normalizeEmail(req.body.email);

    const [[user]] = await db.query(
      `SELECT id, username, name, email FROM users
       WHERE LOWER(TRIM(email)) = ? AND status != 0
       LIMIT 1`,
      { replacements: [email] }
    );

    if (!user?.email) {
      return res.status(404).json({
        status: false,
        message: "No account found with this email address",
        code: "AUTH_EMAIL_NOT_FOUND",
      });
    }

    const { rawToken } = await createPasswordResetToken(user.id);
        console.log('getFrontendUrl',frontendUrl);

    const resetUrl = `${frontendUrl}/admin/reset-password?token=${rawToken}`;
    const mailResult = await sendPasswordResetEmail({
      to: user.email,
      name: user.name || user.username,
      resetUrl,
    });

    if (!mailResult.sent) {
      return res.status(503).json({
        status: false,
        message:
          "Email service is not configured. Set SMTP_MAIL, SMTP_PASSWORD (or SMTP_USER, SMTP_PASS) in .env and restart the server.",
        code: "AUTH_MAIL_NOT_CONFIGURED",
      });
    }

    logInfo(`Password reset requested for user id ${user.id}`, "auth.forgotPassword");

    return res.status(200).json({
      status: true,
      message: FORGOT_PASSWORD_SUCCESS_MSG,
    });
  } catch (error) {
    logError(error, "auth.forgotPassword");
    return res.status(500).json({
      status: false,
      message: isProduction
        ? "Unable to process password reset request. Please try again."
        : error.message,
      code: "INTERNAL_ERROR",
    });
  }
};

export const resetPassword = async (req, res) => {
  try {
    await setSessionDefaults();
    const { token, password } = req.body;

    const resetRow = await findValidResetToken(token);
    if (!resetRow) {
      return res.status(400).json({
        status: false,
        message: "Invalid or expired reset token",
        code: "AUTH_RESET_TOKEN_INVALID",
      });
    }

    const hashedPassword = await bcrypt.hash(password, bcryptRounds);
    await db.query(
      `UPDATE users SET password = ?, updatedon = NOW() WHERE id = ? AND status != 0`,
      { replacements: [hashedPassword, resetRow.user_id] }
    );

    await markResetTokenUsed(resetRow.token_id);
    await clearUserSessions(resetRow.user_id);

    logInfo(`Password reset completed for user id ${resetRow.user_id}`, "auth.resetPassword");

    return res.status(200).json({
      status: true,
      message: "Password reset successful. You can sign in with your new password.",
    });
  } catch (error) {
    logError(error, "auth.resetPassword");
    return res.status(500).json({
      status: false,
      message: isProduction ? "Unable to reset password. Please try again." : error.message,
      code: "INTERNAL_ERROR",
    });
  }
};

export const me = async (req, res) => {
  try {
    const permissions = [];
    const [permRows] = await db.query(
      `SELECT p.id, p.name FROM rolepermission rp
       JOIN permissions p ON p.id = rp.permission_id
       WHERE rp.role_id = ? AND p.status = 1`,
      { replacements: [req.user.role_id] }
    );
    permRows.forEach((p) => permissions.push({ id: p.id, name: p.name }));

    const sidebar = await loadSidebar(req.user.role_id);

    return res.status(200).json({
      status: true,
      message: "Session valid",
      data: {
        user: {
          id: req.user.id,
          username: req.user.username,
          name: req.user.name,
          role_id: req.user.role_id,
          role_name: req.user.role_name,
        },
        permissions,
        sidebar,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: isProduction ? "Internal server error" : error.message,
      code: "INTERNAL_ERROR",
    });
  }
};
