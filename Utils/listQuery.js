/** Standard list query: ?page=1&limit=10&search=keyword */

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 100;

/**
 * Parse pagination + search from query string.
 * Search key is always `search` (trimmed string).
 */
export function parseListQuery(query = {}, options = {}) {
  const defaultPage = options.defaultPage ?? DEFAULT_PAGE;
  const defaultLimit = options.defaultLimit ?? DEFAULT_LIMIT;
  const maxLimit = options.maxLimit ?? MAX_LIMIT;

  const page = Math.max(1, parseInt(query.page, 10) || defaultPage);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  const offset = (page - 1) * limit;
  const search = String(query.search ?? "").trim();

  return { page, limit, offset, search };
}

/** Build SQL LIKE clause: AND (col1 LIKE ? OR col2 LIKE ?) */
export function buildLikeSearch(columns, search, { prefix = " AND ", combine = "OR" } = {}) {
  if (!search || !columns?.length) return { clause: "", params: [] };
  const parts = columns.map((col) => `${col} LIKE ?`);
  const params = columns.map(() => `%${search}%`);
  return {
    clause: `${prefix}(${parts.join(` ${combine} `)})`,
    params,
  };
}

/** Standard paginated list response shape */
export function listResult(rows, { page, limit, total }) {
  return {
    rows,
    page,
    limit,
    total: Number(total) || 0,
  };
}

/**
 * Report pagination: active only when `page` or `limit` is present in the query.
 * `count` in report responses stays the full filtered total; SQL uses LIMIT/OFFSET separately.
 */
export function parseReportPagination(query = {}, options = {}) {
  const defaultLimit = options.defaultLimit ?? 20;
  const maxLimit = options.maxLimit ?? 100;
  const hasPage = query.page != null && String(query.page).trim() !== "";
  const hasLimit = query.limit != null && String(query.limit).trim() !== "";
  if (!hasPage && !hasLimit) return null;

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export function slicePaginated(rows, pagination) {
  if (!pagination || !Array.isArray(rows)) return rows;
  return rows.slice(pagination.offset, pagination.offset + pagination.limit);
}

export function isJsonReportFormat(format) {
  return !format || format === "json";
}
