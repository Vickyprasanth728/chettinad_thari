import dotenv from "dotenv";

dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

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
    accessTokenExpiry: process.env.ACCESS_TOKEN_EXPIRY || "15m",
    refreshTokenExpiry: process.env.REFRESH_TOKEN_EXPIRY || "7d",
    bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 12,
    useRefreshCookie: process.env.REFRESH_TOKEN_COOKIE === "true",
    cookieSecure: isProduction || process.env.COOKIE_SECURE === "true",
  };
}
