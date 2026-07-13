import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const isProduction = process.env.NODE_ENV === "production";

function trimEnv(value) {
  return String(value).trim().replace(/^['"]|['"]$/g, "");
}

/** Base URL for frontend links (emails, redirects). Prefers explicit FRONTEND_URL, then ALLOWED_ORIGIN. */
export function getFrontendUrl() {
  const url =
    process.env.FRONTEND_URL ||
    process.env.APP_URL ||
    process.env.ALLOWED_ORIGIN ||
    "http://localhost:3000";
  return trimEnv(url).replace(/\/$/, "");
}

function requireEnv(key) {
  const value = process.env[key];
  if (!value || String(value).trim() === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function validateEnv() {
  requireEnv("DB_HOST");
  requireEnv("DB_USER");
  requireEnv("DB_DATABASE");
  requireEnv("ACCESS_TOKEN_SECRET");
  requireEnv("REFRESH_TOKEN_SECRET");

  const minSecretLength = isProduction ? 32 : 16;
  if (process.env.ACCESS_TOKEN_SECRET.length < minSecretLength) {
    throw new Error(`ACCESS_TOKEN_SECRET must be at least ${minSecretLength} characters`);
  }
  if (process.env.REFRESH_TOKEN_SECRET.length < minSecretLength) {
    throw new Error(`REFRESH_TOKEN_SECRET must be at least ${minSecretLength} characters`);
  }

  return {
    isProduction,
    port: Number(process.env.PORT) || 8080,
    allowedOrigin: process.env.ALLOWED_ORIGIN || "http://localhost:3000",
    frontendUrl: getFrontendUrl(),
    accessTokenExpiry: process.env.ACCESS_TOKEN_EXPIRY || "15m",
    refreshTokenExpiry: process.env.REFRESH_TOKEN_EXPIRY || "7d",
    bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 12,
    useRefreshCookie: process.env.REFRESH_TOKEN_COOKIE === "true",
    cookieSecure: isProduction || process.env.COOKIE_SECURE === "true",
  };
}
