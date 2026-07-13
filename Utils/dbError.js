import { sendError } from "./response.js";

const CONSTRAINT_MESSAGES = {
  uk_sidebar_name: "Sidebar name already exists",
  uk_sidebar_icon: "Sidebar icon already exists",
  uk_sidebar_path: "Sidebar path already exists",
  uk_gmaster_value: "This value already exists for the selected master",
  uk_product_name: "Product name already exists",
  uk_design_master_name: "Design name already exists",
  name: "Name already exists",
  stock_no: "Stock no already exists",
  username: "Username already exists",
  email: "Email already exists",
  mobileno: "Mobile number already exists",
};

/** Map Sequelize / MySQL duplicate-key errors to a client-safe message. */
export function getDbErrorResponse(error) {
  const code = error?.original?.code || error?.parent?.code;
  const isDuplicate =
    error?.name === "SequelizeUniqueConstraintError" || code === "ER_DUP_ENTRY";

  if (!isDuplicate) return null;

  const item = error?.errors?.[0];
  const constraint = item?.path;
  if (constraint && CONSTRAINT_MESSAGES[constraint]) {
    return { message: CONSTRAINT_MESSAGES[constraint], status: 409 };
  }
  if (item?.message && /must be unique/i.test(item.message)) {
    const field = constraint || "field";
    return { message: `${field.charAt(0).toUpperCase()}${field.slice(1)} already exists`, status: 409 };
  }

  const sqlMessage = error?.original?.sqlMessage || error?.parent?.sqlMessage || "";
  const keyMatch = sqlMessage.match(/for key '([^']+)'/i);
  const keyName = keyMatch?.[1];
  if (keyName && CONSTRAINT_MESSAGES[keyName]) {
    return { message: CONSTRAINT_MESSAGES[keyName], status: 409 };
  }

  if (keyName === "uk_sidebar_name" || /for key 'uk_sidebar_name'/i.test(sqlMessage)) {
    return { message: "Sidebar name already exists", status: 409 };
  }
  if (keyName === "uk_sidebar_icon" || /for key 'uk_sidebar_icon'/i.test(sqlMessage)) {
    return { message: "Sidebar icon already exists", status: 409 };
  }
  if (keyName === "uk_sidebar_path" || /for key 'uk_sidebar_path'/i.test(sqlMessage)) {
    return { message: "Sidebar path already exists", status: 409 };
  }
  if (keyName === "uk_product_name" || /for key 'uk_product_name'/i.test(sqlMessage)) {
    return { message: "Product name already exists", status: 409 };
  }
  if (keyName === "uk_design_master_name" || /for key 'uk_design_master_name'/i.test(sqlMessage)) {
    return { message: "Design name already exists", status: 409 };
  }

  if (keyName === "stock_no" || /for key 'stock_no'/i.test(sqlMessage)) {
    return { message: "Stock no already exists", status: 409 };
  }

  return { message: "Duplicate entry — record already exists", status: 409 };
}

/** Human-readable message for bulk upload / catch blocks (Sequelize often returns "Validation error"). */
export function getReadableDbErrorMessage(error, fallback = "Upload failed") {
  const duplicate = getDbErrorResponse(error);
  if (duplicate) return duplicate.message;

  const parent = error?.parent || error?.original;
  const sqlMessage = parent?.sqlMessage || "";
  const code = parent?.code || parent?.errno;

  if (code === "ER_DUP_ENTRY" || /Duplicate entry/i.test(sqlMessage)) {
    if (/uk_product_name|product_name/i.test(sqlMessage)) return "Product name already exists";
    if (/uk_design_master_name/i.test(sqlMessage)) return "Design name already exists";
    if (/stock_no/i.test(sqlMessage)) return "Stock no already exists";
    return "Duplicate entry — record already exists";
  }

  if (
    code === "ER_NO_REFERENCED_ROW_2" ||
    code === "ER_NO_REFERENCED_ROW" ||
    /foreign key constraint fails/i.test(sqlMessage)
  ) {
    if (/design_master|design_id/i.test(sqlMessage)) {
      return "Design code not found or invalid";
    }
    if (/vendors|vendor_id/i.test(sqlMessage)) {
      return "Vendor not found or invalid";
    }
    if (/gst/i.test(sqlMessage)) {
      return "GST rate not found in master";
    }
    return "Invalid reference — check Vendor, Design Code, or GST %";
  }

  if (/Duplicate entry/i.test(sqlMessage)) {
    if (/for key 'name'/i.test(sqlMessage)) return "Name already exists";
    return "Duplicate entry — record already exists";
  }

  if (error?.message && error.message !== "Validation error") {
    return error.message;
  }
  if (error?.errors?.[0]?.message) {
    return error.errors[0].message;
  }
  if (sqlMessage) return sqlMessage;
  return fallback;
}

/** Send a JSON error for DB / controller failures without crashing the process. */
export function respondDbError(res, error, fallback = "Request failed", serverStatus = 500) {
  const duplicate = getDbErrorResponse(error);
  if (duplicate) return sendError(res, duplicate.message, duplicate.status);

  const message = error?.message || fallback;
  if (/already exists/i.test(message) || /is required/i.test(message)) {
    const status = /already exists/i.test(message) ? 409 : 400;
    return sendError(res, message, status);
  }

  console.error(error);
  return sendError(res, message, serverStatus);
}
