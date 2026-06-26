const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function validateGSTIN(gstNumber) {
  if (!gstNumber) return { valid: true };
  const cleaned = String(gstNumber).trim().toUpperCase();
  if (!GSTIN_REGEX.test(cleaned)) {
    return { valid: false, message: "Invalid GSTIN format" };
  }
  return { valid: true, value: cleaned };
}
