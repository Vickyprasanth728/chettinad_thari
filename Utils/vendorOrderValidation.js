import { parseNonNegativeDecimal, parsePositiveDecimal, parsePositiveInt } from "./productValidation.js";

function parseBillNo(value, { required = true } = {}) {
  if (value === undefined || value === null || value === "") {
    if (!required) return {};
    return { error: "bill no is required" };
  }

  const raw = String(value).trim();
  if (!raw) return { error: "bill no is required" };

  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    const num = Number(raw);
    if (!Number.isFinite(num) || num <= 0) {
      return { error: "bill no must be greater than zero" };
    }
  }

  return { value: raw };
}

export function validateVendorOrderPayload(body, { mode = "create" } = {}) {
  const errors = [];
  const values = {};

  const billNo = parseBillNo(body.bill_no, { required: mode === "create" });
  if (billNo.error) errors.push(billNo.error);
  else if (billNo.value !== undefined) values.bill_no = billNo.value;

  for (const field of ["no_of_packages", "no_of_items"]) {
    if (mode === "create" || body[field] !== undefined) {
      const parsed = parsePositiveInt(body[field], field);
      if (parsed.error) errors.push(parsed.error);
      else values[field] = parsed.value;
    }
  }

  if (mode === "create" || body.total_value !== undefined) {
    const parsed = parsePositiveDecimal(body.total_value, "total_value");
    if (parsed.error) errors.push(parsed.error);
    else values.total_value = parsed.value;
  }

  // gst_amount may be 0 (GST-exempt / not applicable); schema default is 0
  if (mode === "create" || body.gst_amount !== undefined) {
    const parsed = parseNonNegativeDecimal(body.gst_amount, "gst_amount", { defaultValue: 0 });
    if (parsed.error) errors.push(parsed.error);
    else values.gst_amount = parsed.value;
  }

  return { ok: errors.length === 0, errors, values };
}
