import { requireCrudId } from "../Utils/crudQuery.js";

/** Attach `req.crudId` from query `?id=` (GET by id only). */
export function requireCrudIdQuery(req, res, next) {
  const id = requireCrudId(req, res);
  if (id == null) return;
  req.crudId = id;
  next();
}
