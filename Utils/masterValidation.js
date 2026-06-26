export const getIdField = (config) => config.idField || "id";

export const isEmpty = (value) =>
  value === undefined ||
  value === null ||
  (typeof value === "string" && value.trim() === "");

/** Keep only fields declared in master config (ignore UI metadata like edit, unique, type). */
export const sanitizeMasterInput = (raw, config) => {
  const allowed = new Set(config.fields.map((f) => f.name));
  const data = {};
  for (const key of Object.keys(raw || {})) {
    if (allowed.has(key)) data[key] = raw[key];
  }
  return data;
};

export const coerceFieldValue = (field, value) => {
  if (field.type === "number") {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      throw new Error(`Invalid ${field.name}: must be a number`);
    }
    return num;
  }
  if (field.type === "string") {
    let str = String(value).trim();
    if (field.lowercase) str = str.toLowerCase();
    return str;
  }
  return value;
};

export const validateMasterData = (data, config, { mode = "create" } = {}) => {
  for (const field of config.fields) {
    const raw = data[field.name];

    if (field.required && isEmpty(raw)) {
      throw new Error(`${field.name} is required`);
    }

    if (!isEmpty(raw)) {
      if (field.enum && !field.enum.includes(raw)) {
        throw new Error(`Invalid ${field.name}`);
      }
      if (field.type === "number" && !Number.isFinite(Number(raw))) {
        throw new Error(`Invalid ${field.name}: must be a number`);
      }
      if (field.type === "string" && typeof raw !== "string" && typeof raw !== "number") {
        throw new Error(`Invalid ${field.name}: must be a string`);
      }
    }
  }

  if (mode === "update" && config.uniqueScope?.length) {
    for (const scopeField of config.uniqueScope) {
      const scopeDef = config.fields.find((f) => f.name === scopeField);
      if (scopeDef?.required && isEmpty(data[scopeField])) {
        throw new Error(`${scopeField} is required`);
      }
    }
  }
};

export const buildWritePayload = (data, config, { mode = "create" } = {}) => {
  const fields = [];
  const values = [];
  const idField = getIdField(config);

  for (const field of config.fields) {
    const { name } = field;
    if (mode === "update" && name === idField) continue;

    const raw = data[name];
    if (mode === "update" && raw === undefined) continue;

    if (isEmpty(raw)) {
      if (mode === "create") {
        if (field.required) throw new Error(`${name} is required`);
        continue;
      }
      if (!field.required) {
        fields.push(name);
        values.push(null);
      }
      continue;
    }

    fields.push(name);
    values.push(coerceFieldValue(field, raw));
  }

  if (mode === "update" && !fields.length) {
    throw new Error("No fields to update");
  }

  return { fields, values };
};

export const assertUniqueFields = async (db, data, config, excludeId = null) => {
  const table = config.table;
  const idField = getIdField(config);
  const hasStatus = config.fields.some((f) => f.name === "status");

  for (const field of config.fields.filter((f) => f.unique)) {
    const raw = data[field.name];
    if (isEmpty(raw)) continue;

    const value = coerceFieldValue(field, raw);
    let sql = `SELECT ${idField} AS id FROM ${table} WHERE ${field.name} = ?`;
    const params = [value];

    if (config.uniqueScope?.length) {
      for (const scopeField of config.uniqueScope) {
        const scopeDef = config.fields.find((f) => f.name === scopeField);
        const scopeRaw = data[scopeField];
        if (isEmpty(scopeRaw)) {
          throw new Error(`${scopeField} is required`);
        }
        sql += ` AND ${scopeField} = ?`;
        params.push(coerceFieldValue(scopeDef, scopeRaw));
      }
    }

    if (hasStatus) sql += ` AND status != 0`;

    if (excludeId != null && excludeId !== "") {
      sql += ` AND ${idField} != ?`;
      params.push(excludeId);
    }

    const [rows] = await db.query(sql, { replacements: params });
    if (rows.length) {
      const label = field.name.replace(/_/g, " ");
      throw new Error(`${label} already exists`);
    }
  }
};
