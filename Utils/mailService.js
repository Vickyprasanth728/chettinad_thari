import nodemailer from "nodemailer";
import { logError, logInfo } from "../logs/LogController.js";

function envVal(...keys) {
  for (const key of keys) {
    const raw = process.env[key];
    if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
      return String(raw).trim().replace(/^['"]|['"]$/g, "");
    }
  }
  return undefined;
}

function getSmtpConfig() {
  const user = envVal("SMTP_USER", "SMTP_MAIL");
  const pass = envVal("SMTP_PASS", "SMTP_PASSWORD");
  const service = envVal("SMTP_SERVICE");
  const host = envVal("SMTP_HOST");
  const port = Number(envVal("SMTP_PORT")) || 587;
  const from = envVal("SMTP_FROM", "SMTP_MAIL", "SMTP_USER");

  if (!user || !pass) return null;

  if (service) {
    return { service, user, pass, from: from || user };
  }

  if (!host) return null;

  return {
    host,
    port,
    secure: port === 465,
    user,
    pass,
    from: from || user,
  };
}

let transporter = null;
let transporterKey = null;

function getTransporter() {
  const config = getSmtpConfig();
  if (!config) return null;

  const key = JSON.stringify({
    service: config.service,
    host: config.host,
    port: config.port,
    user: config.user,
  });

  if (!transporter || transporterKey !== key) {
    if (config.service) {
      transporter = nodemailer.createTransport({
        service: config.service,
        auth: { user: config.user, pass: config.pass },
      });
    } else {
      transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: { user: config.user, pass: config.pass },
        tls: { rejectUnauthorized: process.env.NODE_ENV === "production" },
      });
    }
    transporterKey = key;
  }

  return { transporter, from: config.from };
}

export function getFrontendUrl() {
  return (envVal("FRONTEND_URL", "APP_URL") || "http://localhost:3000").replace(/\/$/, "");
}

export function isMailConfigured() {
  return getSmtpConfig() !== null;
}

export async function sendPasswordResetEmail({ to, name, resetUrl }) {
  const mail = getTransporter();
  const displayName = name || "User";
  const subject = "Reset your Chettinad Thari password";
  const text = [
    `Hello ${displayName},`,
    "",
    "We received a request to reset your password.",
    "Click the link below to set a new password (valid for 1 hour):",
    "",
    resetUrl,
    "",
    "If you did not request this, you can ignore this email.",
  ].join("\n");

  const html = `
    <p>Hello ${displayName},</p>
    <p>We received a request to reset your password.</p>
    <p><a href="${resetUrl}">Reset your password</a></p>
    <p>This link expires in 1 hour. If you did not request this, you can ignore this email.</p>
  `;

  if (!mail) {
    logInfo(
      `Password reset email NOT sent — SMTP not configured. Set SMTP_USER/SMTP_MAIL and SMTP_PASS/SMTP_PASSWORD in .env. Link for ${to}: ${resetUrl}`,
      "mail.passwordReset"
    );
    return { sent: false, reason: "SMTP_NOT_CONFIGURED" };
  }

  try {
    await mail.transporter.sendMail({
      from: mail.from,
      to,
      subject,
      text,
      html,
    });
    logInfo(`Password reset email sent to ${to}`, "mail.passwordReset");
    return { sent: true };
  } catch (error) {
    logError(error, "mail.passwordReset");
    throw new Error(
      error?.response || error?.message || "Unable to send password reset email. Please try again later."
    );
  }
}
