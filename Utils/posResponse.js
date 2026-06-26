/** Response envelope for chettinad_pos (matches mock API). */
export function posSuccess(res, data, status = 200, meta = {}) {
  return res.status(status).json({ success: true, data, meta });
}

export function posError(res, code, message, status = 400, details = []) {
  return res.status(status).json({
    success: false,
    error: { code, message, details },
  });
}
