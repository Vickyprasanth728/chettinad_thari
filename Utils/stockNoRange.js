/**
 * Parse stock numbers into format-aware parts.
 * - compact: STK002, PK003918 (letters + digits, no hyphen)
 * - hyphen:  CT-001, STK-BULK-004 (prefix ending with hyphen + digits)
 */
export function parseStockNo(stockNo) {
  const raw = String(stockNo ?? "").trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();

  const compactMatch = upper.match(/^([A-Z]+)(\d+)$/);
  if (compactMatch) {
    return {
      format: "compact",
      prefix: compactMatch[1],
      number: parseInt(compactMatch[2], 10),
      raw: upper,
    };
  }

  const hyphenMatch = upper.match(/^(.+-)(\d+)$/);
  if (hyphenMatch) {
    return {
      format: "hyphen",
      prefix: hyphenMatch[1],
      number: parseInt(hyphenMatch[2], 10),
      raw: upper,
    };
  }

  return { format: "raw", prefix: upper, number: null, raw: upper };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sameNumericRange(fromParsed, toParsed) {
  return (
    fromParsed &&
    toParsed &&
    fromParsed.format === toParsed.format &&
    fromParsed.format !== "raw" &&
    fromParsed.prefix === toParsed.prefix &&
    fromParsed.number != null &&
    toParsed.number != null
  );
}

function appendFormatRange(where, params, parsed, lo, hi) {
  const regex = `^${escapeRegex(parsed.prefix)}[0-9]+$`;

  if (parsed.format === "compact") {
    const startPos = parsed.prefix.length + 1;
    where += ` AND UPPER(p.stock_no) REGEXP ? AND CAST(SUBSTRING(UPPER(p.stock_no), ?) AS UNSIGNED) BETWEEN ? AND ?`;
    params.push(regex, startPos, lo, hi);
    return where;
  }

  where += ` AND UPPER(p.stock_no) REGEXP ? AND CAST(SUBSTRING_INDEX(UPPER(p.stock_no), '-', -1) AS UNSIGNED) BETWEEN ? AND ?`;
  params.push(regex, lo, hi);
  return where;
}

function appendFormatFrom(where, params, parsed, fromNum) {
  const regex = `^${escapeRegex(parsed.prefix)}[0-9]+$`;

  if (parsed.format === "compact") {
    const startPos = parsed.prefix.length + 1;
    where += ` AND UPPER(p.stock_no) REGEXP ? AND CAST(SUBSTRING(UPPER(p.stock_no), ?) AS UNSIGNED) >= ?`;
    params.push(regex, startPos, fromNum);
    return where;
  }

  where += ` AND UPPER(p.stock_no) REGEXP ? AND CAST(SUBSTRING_INDEX(UPPER(p.stock_no), '-', -1) AS UNSIGNED) >= ?`;
  params.push(regex, fromNum);
  return where;
}

function appendFormatTo(where, params, parsed, toNum) {
  const regex = `^${escapeRegex(parsed.prefix)}[0-9]+$`;

  if (parsed.format === "compact") {
    const startPos = parsed.prefix.length + 1;
    where += ` AND UPPER(p.stock_no) REGEXP ? AND CAST(SUBSTRING(UPPER(p.stock_no), ?) AS UNSIGNED) <= ?`;
    params.push(regex, startPos, toNum);
    return where;
  }

  where += ` AND UPPER(p.stock_no) REGEXP ? AND CAST(SUBSTRING_INDEX(UPPER(p.stock_no), '-', -1) AS UNSIGNED) <= ?`;
  params.push(regex, toNum);
  return where;
}

/**
 * Append WHERE clauses for from_stockno / to_stockno (case-insensitive).
 * Compact codes (STK002..STK009) only match the same pattern, not STK-BULK-004.
 */
export function appendStockNoRangeWhere(where, params, fromStockNo, toStockNo) {
  const from = fromStockNo ? String(fromStockNo).trim() : null;
  const to = toStockNo ? String(toStockNo).trim() : null;
  if (!from && !to) return where;

  const fromParsed = from ? parseStockNo(from) : null;
  const toParsed = to ? parseStockNo(to) : null;

  if (sameNumericRange(fromParsed, toParsed)) {
    const lo = Math.min(fromParsed.number, toParsed.number);
    const hi = Math.max(fromParsed.number, toParsed.number);
    return appendFormatRange(where, params, fromParsed, lo, hi);
  }

  if (from && fromParsed?.format !== "raw" && fromParsed?.number != null && !to) {
    return appendFormatFrom(where, params, fromParsed, fromParsed.number);
  }

  if (to && toParsed?.format !== "raw" && toParsed?.number != null && !from) {
    return appendFormatTo(where, params, toParsed, toParsed.number);
  }

  if (from) {
    where += ` AND UPPER(p.stock_no) >= ?`;
    params.push(from.toUpperCase());
  }
  if (to) {
    where += ` AND UPPER(p.stock_no) <= ?`;
    params.push(to.toUpperCase());
  }
  return where;
}
