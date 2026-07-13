const DECIMAL_PATTERN = /^\d+(\.\d{1,2})?$/;
const WHOLE_NUMBER_PATTERN = /^\d+$/;

function formatFieldLabel(field) {
  return field.replace(/_/g, " ");
}

export function parsePositiveDecimal(value, field = "retail_price") {
  const label = formatFieldLabel(field);
  if (value === undefined || value === null || value === "") {
    return { error: `${label} is required` };
  }

  const raw = String(value).trim();
  if (!DECIMAL_PATTERN.test(raw)) {
    return { error: `${label} must be a positive number with up to 2 decimal places` };
  }

  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) {
    return { error: `${label} must be greater than zero` };
  }

  return { value: Math.round(num * 100) / 100 };
}

export function parsePositiveInt(value, field = "low_stock_threshold", { defaultValue } = {}) {
  const label = formatFieldLabel(field);

  if (value === undefined || value === null || value === "") {
    if (defaultValue !== undefined) return { value: defaultValue };
    return { error: `${label} is required` };
  }

  const raw = String(value).trim();
  if (!WHOLE_NUMBER_PATTERN.test(raw)) {
    return { error: `${label} must be a whole number greater than zero` };
  }

  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) {
    return { error: `${label} must be greater than zero` };
  }

  return { value: num };
}

export function parseNonNegativeDecimal(value, field = "discount", { defaultValue = 0 } = {}) {
  const label = formatFieldLabel(field);

  if (value === undefined || value === null || value === "") {
    return { value: defaultValue };
  }

  const raw = String(value).trim();
  if (!DECIMAL_PATTERN.test(raw)) {
    return { error: `${label} must be a non-negative number with up to 2 decimal places` };
  }

  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) {
    return { error: `${label} cannot be negative` };
  }

  return { value: Math.round(num * 100) / 100 };
}

export function validateDiscountAgainstPrice(discount, retailPrice) {
  if (retailPrice === undefined || retailPrice === null) return null;
  if (discount === undefined || discount === null) return null;
  if (Number(discount) > Number(retailPrice)) {
    return "discount cannot exceed retail_price";
  }
  return null;
}

function isBlankOptionalNumber(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  return false;
}

/**
 * Optional positive int (e.g. low_stock_threshold).
 * Missing/blank → default on create, omit on update.
 * Zero is treated as blank (field not used) so empty number inputs do not fail;
 * a stored threshold can never be 0. Non-zero invalid values still error.
 */
export function parseOptionalPositiveInt(value, field = "low_stock_threshold", { defaultValue } = {}) {
  if (isBlankOptionalNumber(value)) {
    if (defaultValue !== undefined) return { value: defaultValue };
    return { omitted: true };
  }

  const raw = String(value).trim();
  // Empty number inputs often send 0 — treat as "not set", never persist 0
  if (WHOLE_NUMBER_PATTERN.test(raw) && Number(raw) === 0) {
    if (defaultValue !== undefined) return { value: defaultValue };
    return { omitted: true };
  }

  return parsePositiveInt(value, field);
}

export function validateProductPricingFields(body, { mode = "create", currentRetailPrice, currentDiscount } = {}) {
  const errors = [];
  const values = {};

  if (mode === "create" || body.retail_price !== undefined) {
    const parsed = parsePositiveDecimal(body.retail_price, "retail_price");
    if (parsed.error) errors.push(parsed.error);
    else values.retail_price = parsed.value;
  }

  // Optional: blank/0 → default 5 on create, skip on update. Non-zero values must be > 0.
  if (mode === "create" || body.low_stock_threshold !== undefined) {
    const parsed = parseOptionalPositiveInt(body.low_stock_threshold, "low_stock_threshold", {
      defaultValue: mode === "create" ? 5 : undefined,
    });
    if (parsed.error) errors.push(parsed.error);
    else if (!parsed.omitted) values.low_stock_threshold = parsed.value;
  }

  if (mode === "create" || body.discount !== undefined) {
    const parsed = parseNonNegativeDecimal(body.discount, "discount", {
      defaultValue: mode === "create" ? 0 : undefined,
    });
    if (parsed.error) errors.push(parsed.error);
    else values.discount = parsed.value;
  } else if (mode === "create") {
    values.discount = 0;
  }

  const effectiveRetailPrice = values.retail_price ?? currentRetailPrice;
  const effectiveDiscount = values.discount ?? currentDiscount ?? 0;
  const discountError = validateDiscountAgainstPrice(effectiveDiscount, effectiveRetailPrice);
  if (discountError) errors.push(discountError);

  return { ok: errors.length === 0, errors, values };
}
