/** Admin report filter / list display labels */
export const PAYMENT_TYPE_LABELS = ["Cash", "UPI", "Card", "Credit", "Net Banking"];

const DB_TO_LABEL = {
  cash: "Cash",
  card: "Card",
  upi: "UPI",
  net_banking: "Net Banking",
  online: "Online",
  credit: "Credit",
};

const LABEL_TO_DB = {
  cash: "cash",
  card: "card",
  upi: "upi",
  "net banking": "net_banking",
  net_banking: "net_banking",
  online: "online",
  credit: "credit",
};

export function formatPaymentMethod(value) {
  if (!value) return "";
  const key = String(value).trim().toLowerCase().replace(/\s+/g, "_");
  return DB_TO_LABEL[key] || value;
}

/** Map filter dropdown value (display or db) to split_payments enum value */
export function normalizePaymentMethod(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  const lower = trimmed.toLowerCase();
  if (LABEL_TO_DB[lower]) return LABEL_TO_DB[lower];
  const underscored = lower.replace(/\s+/g, "_");
  if (DB_TO_LABEL[underscored]) return underscored;
  return null;
}

export function formatPaymentMethodsList(concatenated) {
  if (!concatenated) return "";
  return concatenated
    .split(",")
    .map((part) => formatPaymentMethod(part.trim()))
    .join(", ");
}

/** Display labels from daily report payment_raw e.g. "cash:100|upi:50" → "Cash, UPI" */
export function formatPaymentTypeNamesFromRaw(raw) {
  if (!raw) return "";
  const labels = [];
  const seen = new Set();
  for (const part of String(raw).split("|")) {
    const sep = part.lastIndexOf(":");
    const method = (sep > 0 ? part.slice(0, sep) : part).trim();
    if (!method) continue;
    const label = formatPaymentMethod(method);
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }
  return labels.join(", ");
}

/** Format split-payment breakdown e.g. "Cash-100.00, Card-300.00" */
export function formatPaymentAmountsBreakdown(raw) {
  if (!raw) return "";
  return String(raw)
    .split("|")
    .map((part) => {
      const sep = part.lastIndexOf(":");
      if (sep <= 0) return part.trim();
      const method = part.slice(0, sep).trim();
      const amount = Number(part.slice(sep + 1));
      const label = formatPaymentMethod(method);
      if (!Number.isFinite(amount)) return label;
      const formatted = amount.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      return `${label}-${formatted}`;
    })
    .filter(Boolean)
    .join(", ");
}
