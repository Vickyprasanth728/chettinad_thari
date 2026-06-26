import { sendError } from "./response.js";

/** CRUD list/detail: read id from path param (:id) or query (?id=). */
export function getCrudId(req) {
  const id = req.params?.id ?? req.query?.id;
  if (id === undefined || id === null || id === "") return null;
  return id;
}

export function hasCrudId(req) {
  return getCrudId(req) != null;
}

export function requireCrudId(req, res) {
  const id = getCrudId(req);
  if (id == null) {
    sendError(res, "id is required (path or query parameter)", 400);
    return null;
  }
  return id;
}

/**
 * Sequelize rejects undefined positional replacements.
 * Use with COALESCE(?, column) partial updates — omitted fields become SQL NULL.
 */
export function sqlReplacements(...values) {
  return values.map((value) => (value === undefined ? null : value));
}
