import crypto from "crypto";
import { db } from "../config/Database.js";

const TOKEN_BYTES = 32;
const DEFAULT_EXPIRY_MINUTES = Number(process.env.PASSWORD_RESET_EXPIRY_MINUTES) || 60;

export function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function hashResetToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken)).digest("hex");
}

export function generateResetToken() {
  const rawToken = crypto.randomBytes(TOKEN_BYTES).toString("hex");
  return { rawToken, tokenHash: hashResetToken(rawToken) };
}

export function getResetTokenExpiryDate(minutes = DEFAULT_EXPIRY_MINUTES) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

export async function invalidateUserResetTokens(userId) {
  await db.query(
    `UPDATE password_reset_tokens SET used_at = NOW()
     WHERE user_id = ? AND used_at IS NULL`,
    { replacements: [userId] }
  );
}

export async function createPasswordResetToken(userId) {
  const { rawToken, tokenHash } = generateResetToken();
  const expiresAt = getResetTokenExpiryDate();

  await invalidateUserResetTokens(userId);
  await db.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)`,
    { replacements: [userId, tokenHash, expiresAt] }
  );

  return { rawToken, expiresAt };
}

export async function findValidResetToken(rawToken) {
  const tokenHash = hashResetToken(rawToken);
  const [[row]] = await db.query(
    `SELECT prt.id AS token_id, prt.user_id, u.username, u.email, u.status
     FROM password_reset_tokens prt
     JOIN users u ON u.id = prt.user_id
     WHERE prt.token_hash = ?
       AND prt.used_at IS NULL
       AND prt.expires_at > NOW()
       AND u.status != 0
     LIMIT 1`,
    { replacements: [tokenHash] }
  );
  return row || null;
}

export async function markResetTokenUsed(tokenId) {
  await db.query(
    `UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?`,
    { replacements: [tokenId] }
  );
}

export async function clearUserSessions(userId) {
  await db.query(
    `UPDATE user_status SET refresh_token = NULL, loginAttempts = 0, loginBlockedUntil = NULL
     WHERE userid = ?`,
    { replacements: [userId] }
  );
}
