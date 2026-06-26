import jwt from "jsonwebtoken";
import crypto from "crypto";

function getAuthEnv() {
  return {
    accessTokenExpiry: process.env.ACCESS_TOKEN_EXPIRY || "15m",
    refreshTokenExpiry: process.env.REFRESH_TOKEN_EXPIRY || "7d",
    useRefreshCookie: process.env.REFRESH_TOKEN_COOKIE === "true",
    cookieSecure:
      process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "true",
  };
}

const env = getAuthEnv();

const ACCESS_ISSUER = "chettinad-thari-api";
const ACCESS_AUDIENCE = "chettinad-thari-client";

export function signAccessToken(payload) {
  return jwt.sign(
    { ...payload, type: "access" },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: env.accessTokenExpiry,
      issuer: ACCESS_ISSUER,
      audience: ACCESS_AUDIENCE,
      jwtid: crypto.randomUUID(),
    }
  );
}

export function signRefreshToken(payload) {
  return jwt.sign(
    { ...payload, type: "refresh" },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: env.refreshTokenExpiry,
      issuer: ACCESS_ISSUER,
      audience: ACCESS_AUDIENCE,
      jwtid: crypto.randomUUID(),
    }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, {
    issuer: ACCESS_ISSUER,
    audience: ACCESS_AUDIENCE,
  });
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.REFRESH_TOKEN_SECRET, {
    issuer: ACCESS_ISSUER,
    audience: ACCESS_AUDIENCE,
  });
}

export function getTokenExpirySeconds(expiresIn) {
  const match = String(expiresIn).match(/^(\d+)([smhd])$/);
  if (!match) return 900;
  const n = parseInt(match[1], 10);
  const unit = { s: 1, m: 60, h: 3600, d: 86400 }[match[2]];
  return n * unit;
}

export const authEnv = env;
export { getAuthEnv };
