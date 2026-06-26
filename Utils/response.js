export const sendSuccess = (res, message, data = null, status = 200) => {
  const body = { status: true, message };
  if (data !== null && data !== undefined) body.data = data;
  return res.status(status).json(body);
};

/** Report JSON responses include total filtered row count (independent of pagination). */
export const sendReportSuccess = (res, message, data, count, pagination = null, status = 200) => {
  const total = Number(count);
  const body = {
    status: true,
    count: Number.isFinite(total) ? total : 0,
    message,
    data,
  };
  if (pagination) {
    body.page = pagination.page;
    body.limit = pagination.limit;
  }
  return res.status(status).json(body);
};

/** Success response with data object only (no message). */
export const sendData = (res, data, status = 200) => {
  return res.status(status).json({ status: true, data });
};

export const sendError = (res, message, status = 400, error = null) => {
  const body = { status: false, message };
  if (error) body.error = error;
  return res.status(status).json(body);
};
