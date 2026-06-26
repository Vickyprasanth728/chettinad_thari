/**
 * Generates Chettinad Thari API documentation Excel.
 * Run: node scripts/generate-api-excel.js
 */
import xlsx from "xlsx";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://localhost:8080/api/v1";

const ENVELOPE_OK = '{ "status": true, "message": "...", "data": { ... } }';
const ENVELOPE_ERR = '{ "status": false, "message": "Error description", "code": "OPTIONAL_CODE" }';

/** @type {Array<Record<string, string>>} */
const rows = [];

function add(row) {
  rows.push({
    Module: row.module,
    "#": String(rows.filter((r) => r.Module === row.module).length + 1),
    Method: row.method,
    "Full URL": `${BASE}${row.path}`,
    Path: row.path,
    Auth: row.auth ?? "Bearer Token",
    Permission: row.permission ?? "—",
    "Content-Type": row.contentType ?? (row.method === "GET" || row.method === "DELETE" ? "—" : "application/json"),
    "Query Params": row.query ?? "—",
    "Path Params": row.params ?? "—",
    "Request Body": row.request ?? "—",
    "Success Status": row.successStatus ?? "200",
    "Success Response": row.response ?? ENVELOPE_OK,
    "Error Response": row.errors ?? ENVELOPE_ERR,
    Notes: row.notes ?? "",
  });
}

// ——— General ———
add({
  module: "General",
  method: "GET",
  path: "/",
  auth: "No",
  permission: "—",
  response: '{ "status": true, "message": "Chettinad Thari API running on port 8080" }',
  notes: "Root health (not under /api/v1)",
});

// ——— Auth ———
add({
  module: "Auth",
  method: "POST",
  path: "/auth/signin",
  auth: "No",
  request: `{
  "username": "admin",
  "password": "admin123"
}`,
  response: `{
  "status": true,
  "message": "Login successful",
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "tokenType": "Bearer",
    "expiresIn": 900,
    "user": { "id": 1, "username": "admin", "name": "System Admin", "role_id": 1, "role_name": "Admin" },
    "permissions": ["product:read", "pos:billing", "..."],
    "sidebar": [{ "id": 1, "name": "Dashboard", "icon": "dashboard", "path": "/dashboard" }]
  }
}`,
  errors: `{ "status": false, "message": "Invalid credentials", "code": "AUTH_INVALID_CREDENTIALS" }`,
});
add({
  module: "Auth",
  method: "POST",
  path: "/auth/forgot-password",
  auth: "No",
  request: `{ "email": "admin@chettinad.com" }`,
  response: `{ "status": true, "message": "Password reset link has been sent to your registered email." }`,
  errors: `{ "status": false, "message": "No account found with this email address", "code": "AUTH_EMAIL_NOT_FOUND" }`,
});
add({
  module: "Auth",
  method: "POST",
  path: "/auth/reset-password",
  auth: "No",
  request: `{
  "token": "<64-char-hex-from-email-link>",
  "password": "newPassword123",
  "confirm_password": "newPassword123"
}`,
  response: `{ "status": true, "message": "Password reset successful. You can sign in with your new password." }`,
  errors: `{ "status": false, "message": "Invalid or expired reset token", "code": "AUTH_RESET_TOKEN_INVALID" }`,
});
add({
  module: "Auth",
  method: "POST",
  path: "/auth/refresh-token",
  auth: "No",
  request: `{ "refreshToken": "<token>", "userid": 1 }`,
  response: `{ "status": true, "data": { "accessToken": "eyJ..." } }`,
});
add({
  module: "Auth",
  method: "POST",
  path: "/auth/signout",
  permission: "Bearer",
  response: `{ "status": true, "message": "Signed out" }`,
});
add({
  module: "Auth",
  method: "GET",
  path: "/auth/me",
  permission: "Bearer",
  response: `{ "status": true, "data": { "user": {...}, "permissions": [...] } }`,
});

// ——— Users ———
add({
  module: "Users",
  method: "GET",
  path: "/users",
  permission: "user:read",
  query: "search, page, limit",
  response: `{ "data": [{ "id", "username", "name", "email", "mobileno", "role_id", "status" }] }`,
});
add({
  module: "Users",
  method: "POST",
  path: "/users",
  permission: "user:create",
  request: `{ "username", "password", "name", "email", "mobileno", "role_id", "status" }`,
  response: `{ "data": { "id": 1 } }`,
});
add({
  module: "Users",
  method: "PUT",
  path: "/users/:id",
  permission: "user:update",
  params: "id",
  request: `{ "name", "email", "mobileno", "role_id", "password" (optional) }`,
});
add({
  module: "Users",
  method: "DELETE",
  path: "/users/:id",
  permission: "user:delete",
  params: "id",
});
add({
  module: "Users",
  method: "GET",
  path: "/users/staff-list",
  permission: "Bearer",
  response: `{ "data": [{ "id", "name", "username" }] }`,
});
add({
  module: "Users",
  method: "POST",
  path: "/users/username-unique",
  auth: "No",
  request: `{ "username": "john" }`,
  response: `{ "data": { "unique": true } }`,
});
add({
  module: "Users",
  method: "POST",
  path: "/users/mobile-unique",
  auth: "No",
  request: `{ "mobileno": "9876543210" }`,
});
add({
  module: "Users",
  method: "POST",
  path: "/users/email-unique",
  auth: "No",
  request: `{ "email": "user@example.com" }`,
});

// ——— Roles ———
add({
  module: "Roles",
  method: "GET",
  path: "/roles",
  permission: "roles:read",
  query: "page, limit, search",
});
add({
  module: "Roles",
  method: "POST",
  path: "/roles",
  permission: "roles:create",
  request: `{ "name": "Custom Role", "status": 1, "permissions": [1, 2, 3] }`,
});
add({
  module: "Roles",
  method: "PUT",
  path: "/roles/:id",
  permission: "roles:update",
  params: "id",
  request: `{ "name", "status", "permissions": [permission_ids] }`,
});
add({
  module: "Roles",
  method: "DELETE",
  path: "/roles/:id",
  permission: "roles:delete",
  params: "id",
});

// ——— Permissions ———
add({ module: "Permissions", method: "GET", path: "/permissions", permission: "permissions:read" });
add({
  module: "Permissions",
  method: "POST",
  path: "/permissions",
  permission: "permissions:create",
  request: `{ "name": "custom:action", "status": 1 }`,
});
add({
  module: "Permissions",
  method: "PUT",
  path: "/permissions/:id",
  permission: "permissions:update",
  params: "id",
});
add({
  module: "Permissions",
  method: "DELETE",
  path: "/permissions/:id",
  permission: "permissions:delete",
  params: "id",
});

// ——— Sidebar ———
add({ module: "Sidebar", method: "GET", path: "/sidebar", permission: "sidebar:read" });
add({
  module: "Sidebar",
  method: "POST",
  path: "/sidebar",
  permission: "sidebar:create",
  request: `{ "name", "icon", "path", "permission", "parent_permission", "status" }`,
});
add({
  module: "Sidebar",
  method: "PUT",
  path: "/sidebar/:id",
  permission: "sidebar:update",
  params: "id",
});
add({
  module: "Sidebar",
  method: "DELETE",
  path: "/sidebar/:id",
  permission: "sidebar:delete",
  params: "id",
});

// ——— GST ———
add({
  module: "GST",
  method: "GET",
  path: "/gst",
  permission: "gst:read",
  response: `{ "data": [{ "id", "name", "tax", "type": "inclusive|exclusive", "status" }] }`,
});
add({
  module: "GST",
  method: "POST",
  path: "/gst",
  permission: "gst:create",
  request: `{ "name": "GST 5%", "tax": 5, "type": "inclusive", "status": 1 }`,
});
add({
  module: "GST",
  method: "PUT",
  path: "/gst/:id",
  permission: "gst:update",
  params: "id",
});
add({
  module: "GST",
  method: "DELETE",
  path: "/gst/:id",
  permission: "gst:delete",
  params: "id",
});

// ——— Masters (generic) ———
const masterTables = "gmaster | gmastervalue | design_master | permissions | roles | sidebar | users";
add({
  module: "Masters",
  method: "GET",
  path: "/:table",
  permission: "master:read (or table-specific)",
  query: "page, limit, search, gmaster_id (gmastervalue only)",
  params: "table — " + masterTables,
  response: `{ "data": { "rows": [...], "page": 1, "limit": 50 } }`,
  notes: "Allowed tables in master_config ALLOWED_TABLES",
});
add({
  module: "Masters",
  method: "POST",
  path: "/:table",
  permission: "master:create",
  params: "table",
  request: "Fields per table — e.g. gmaster: { name }; design_master: { design_code, design_details, status }",
});
add({
  module: "Masters",
  method: "PUT",
  path: "/:table/:id",
  permission: "master:update",
  params: "table, id",
});
add({
  module: "Masters",
  method: "DELETE",
  path: "/:table/:id",
  permission: "master:delete",
  params: "table, id",
  notes: "Soft delete where status field exists",
});
add({
  module: "Masters",
  method: "POST",
  path: "/design/check-unique-code",
  permission: "Bearer",
  request: `{ "design_code": "D001" }`,
  response: `{ "data": { "unique": true } }`,
});

// ——— Products ———
add({
  module: "Products",
  method: "GET",
  path: "/products",
  permission: "product:read",
  query: "search, vendor_id, design_id, low_stock=true, page, limit",
  response: `{ "data": { "rows": [{ "id", "stock_no", "product_name", "quantity", "retail_price", "discount", "gst_name", "vendor_name", "design_code", "published", "status" }], "page", "limit", "total" } }`,
});
add({
  module: "Products",
  method: "GET",
  path: "/products/:id",
  permission: "product:read",
  params: "id",
});
add({
  module: "Products",
  method: "POST",
  path: "/products",
  permission: "product:create",
  request: `{
  "stock_no": "STK001",
  "product_name": "Silk Saree",
  "description": "Optional",
  "quantity": 10,
  "retail_price": 1500,
  "discount": 0,
  "gst_id": 1,
  "hsn_code": "5007",
  "vendor_id": 1,
  "design_id": 1,
  "published": 1
}`,
  response: `{ "data": { "id": 1 } }`,
  errors: `{ "status": false, "message": "Stock no already exists" }`,
});
add({
  module: "Products",
  method: "PUT",
  path: "/products/:id",
  permission: "product:update",
  params: "id",
  notes: "Does not update quantity — use adjust-stock",
});
add({
  module: "Products",
  method: "DELETE",
  path: "/products/:id",
  permission: "product:delete",
  params: "id",
  notes: "Soft delete status=0",
});
add({
  module: "Products",
  method: "POST",
  path: "/products/:id/adjust-stock",
  permission: "inventory:adjust",
  params: "id",
  request: `{ "action": "increase|decrease", "quantity": 5, "reason": "Optional note" }`,
  response: `{ "data": { "quantity": 15 } }`,
});
add({
  module: "Products",
  method: "GET",
  path: "/products/:id/inventory-logs",
  permission: "product:read",
  params: "id",
  response: `{ "data": [{ "action_type", "quantity_changed", "before_qty", "after_qty", "staff_name", "createdon", "reference_type", "reference_id", "notes" }] }`,
});
add({
  module: "Products",
  method: "GET",
  path: "/products/by-stock/:stockNo",
  permission: "Bearer",
  params: "stockNo",
});
add({
  module: "Products",
  method: "GET",
  path: "/products/bulk-upload/template",
  permission: "bulkupload",
  contentType: "—",
  successStatus: "200",
  response: "Binary .xlsx file (product_upload_template.xlsx)",
});
add({
  module: "Products",
  method: "POST",
  path: "/products/bulk-upload",
  permission: "bulkupload",
  contentType: "multipart/form-data",
  request: 'Form field: file (.xlsx/.xls). All columns required: Stock No, Item Description, Retail Price, Discount, GST %, Quantity, Low Stock Threshold, Vendor, HSN, Design Code. Insert only — duplicate stock_no or product_name returns error Excel.',
  response: `{ "data": { "success": 10, "errors": [{ "row": 3, "error": "Missing mandatory fields" }] } }`,
});
add({
  module: "Products",
  method: "GET",
  path: "/products/pos-catalog",
  permission: "pos:read",
  response: `{ "data": [{ "id", "stock_no", "product_name", "quantity", "retail_price", "discount", "gst_id" }] }`,
});
add({
  module: "Products",
  method: "POST",
  path: "/products/qr-scan",
  permission: "qr:read",
  request: `{ "qr_data": "{\\"stock_number\\":\\"STK001\\",\\"id\\":1}" } OR { "stock_no" }`,
});
add({
  module: "Products",
  method: "GET",
  path: "/products/:id/qr-tag",
  permission: "qr:read",
  params: "id",
  response: `{ "data": { "qr_data": "...", "qr_image": "data:image/png;base64,...", "product": {...} } }`,
});
add({
  module: "Products",
  method: "POST",
  path: "/products/check-quantity",
  permission: "pos:check_quantity",
  request: `{ "id": 1, "quantity": 2 }`,
  response: `{ "data": { "available": true, "current_qty": 10 } }`,
});
add({
  module: "Products",
  method: "POST",
  path: "/products/checkstatus",
  auth: "No",
  request: `{ "products": [{ "id": 1 }, { "stock_no": "STK002" }] }`,
  response: `{ "status": true|false, "billedProducts": [...], "missedProducts": [...] }`,
});

// ——— Vendors ———
add({
  module: "Vendors",
  method: "GET",
  path: "/vendors",
  permission: "vendor:read",
  query: "search, page, limit",
});
add({
  module: "Vendors",
  method: "GET",
  path: "/vendors/:id",
  permission: "vendor:read",
  params: "id",
});
add({
  module: "Vendors",
  method: "POST",
  path: "/vendors",
  permission: "vendor:create",
  request: `{ "vendor_name", "address", "email", "phone", "gst_number", "vendor_code" }`,
});
add({
  module: "Vendors",
  method: "PUT",
  path: "/vendors/:id",
  permission: "vendor:update",
  params: "id",
});
add({
  module: "Vendors",
  method: "DELETE",
  path: "/vendors/:id",
  permission: "vendor:delete",
  params: "id",
});
add({
  module: "Vendors",
  method: "GET",
  path: "/vendors/dropdown",
  permission: "Bearer",
  response: `{ "data": [{ "id", "vendor_name", "vendor_code" }] }`,
});
add({
  module: "Vendors",
  method: "GET",
  path: "/vendors/:id/balance",
  permission: "vendor:read",
  params: "id",
  response: `{ "data": { "total_payable", "paid_amount", "pending_amount", "orders": [...] } }`,
});
add({
  module: "Vendors",
  method: "GET",
  path: "/vendors/balance-summary",
  permission: "vendor:read",
});
add({
  module: "Vendors",
  method: "POST",
  path: "/vendors/check-unique-code",
  permission: "Bearer",
  request: `{ "vendor_code": "V001" }`,
});
add({
  module: "Vendors",
  method: "POST",
  path: "/vendors/check-unique-gst",
  permission: "Bearer",
  request: `{ "gst_number": "33AAAAA0000A1Z5" }`,
});

// ——— Vendor Orders ———
add({
  module: "Vendor Orders",
  method: "GET",
  path: "/vendors/orders/list",
  permission: "vendor_order:read",
  query: "vendor_id, page, limit",
});
add({
  module: "Vendor Orders",
  method: "GET",
  path: "/vendors/orders/:id",
  permission: "vendor_order:read",
  params: "id",
});
add({
  module: "Vendor Orders",
  method: "POST",
  path: "/vendors/orders",
  permission: "vendor_order:create",
  request: `{ "vendor_id", "bill_no", "order_date", "no_of_packages", "no_of_items", "total_value", "gst_amount" }`,
});
add({
  module: "Vendor Orders",
  method: "PUT",
  path: "/vendors/orders/:id",
  permission: "vendor_order:update",
  params: "id",
});
add({
  module: "Vendor Orders",
  method: "DELETE",
  path: "/vendors/orders/:id",
  permission: "vendor_order:delete",
  params: "id",
});

// ——— Vendor Payments ———
add({
  module: "Vendor Payments",
  method: "GET",
  path: "/vendors/payments/list",
  permission: "vendor_payment:read",
  query: "vendor_id, page, limit",
});
add({
  module: "Vendor Payments",
  method: "GET",
  path: "/vendors/payments/:id",
  permission: "vendor_payment:read",
  params: "id",
});
add({
  module: "Vendor Payments",
  method: "POST",
  path: "/vendors/payments",
  permission: "vendor_payment:create",
  request: `{ "vendor_id", "vendor_order_id" (optional), "amount", "payment_date", "notes" (optional) }`,
});
add({
  module: "Vendor Payments",
  method: "PUT",
  path: "/vendors/payments/:id",
  permission: "vendor_payment:update",
  params: "id",
  request: `{ "amount", "payment_date", "vendor_order_id", "notes" (all optional) }`,
});
add({
  module: "Vendor Payments",
  method: "DELETE",
  path: "/vendors/payments/:id",
  permission: "vendor_payment:delete",
  params: "id",
});

// ——— POS ———
add({
  module: "POS",
  method: "GET",
  path: "/pos/init",
  permission: "pos:billing",
  response: `{ "data": { "staff": [{ "id", "name" }], "paymentMethods": ["cash","card","upi","net_banking","online","credit"] } }`,
});
add({
  module: "POS",
  method: "GET",
  path: "/pos/bill-number",
  permission: "pos:bill_number",
  response: `{ "data": { "bill_no": "BILL-20260531-0001" } }`,
});
add({
  module: "POS",
  method: "POST",
  path: "/pos/check-quantity",
  permission: "pos:check_quantity",
  request: `{ "items": [{ "product_id": 1, "quantity": 2 }] }`,
});
add({
  module: "POS",
  method: "POST",
  path: "/pos/billing",
  permission: "pos:billing",
  request: `{
  "staff_id": 2,
  "manual_order_number": "ORD-123",
  "customer": { "name", "email", "mobile", "gst_number" },
  "items": [{ "product_id": 1, "quantity": 2, "unit_price": 500, "discount": 0 }],
  "bill_discount": 0,
  "credit_to_apply": 0,
  "payments": [{ "method": "cash", "amount": 500 }, { "method": "card", "amount": 500 }],
  "notes": ""
}`,
  response: `{ "data": { "bill_id", "bill_no": "BILL-YYYYMMDD-####" } }`,
});
add({
  module: "POS",
  method: "GET",
  path: "/pos/bills/:billId",
  permission: "pos:read",
  params: "billId",
  response: `{ "data": { "bill", "items": [...], "payments": [...] } }`,
});
add({
  module: "POS",
  method: "GET",
  path: "/pos/bills/:billId/invoice-pdf",
  permission: "pos:read",
  params: "billId",
  contentType: "—",
  response: "application/pdf binary",
});
add({
  module: "POS",
  method: "POST",
  path: "/pos/return",
  permission: "pos:return",
  request: `{
  "parent_bill_id": 1,
  "items": [{ "product_id": 1, "quantity": 1 }],
  "reason": "Defective",
  "refund_method": "credit"
}`,
  response: `{ "data": { "bill_no": "RET-YYYYMMDD-####", "return_total" } }`,
});
add({
  module: "POS",
  method: "GET",
  path: "/pos/returns/:id",
  permission: "pos:return",
  params: "id",
});
add({
  module: "POS",
  method: "GET",
  path: "/pos/bills/:billId/returns",
  permission: "pos:return",
  params: "billId",
});
add({
  module: "POS",
  method: "POST",
  path: "/pos/cancel-bill",
  permission: "pos:cancel",
  request: `{ "bill_id": 1, "cancellation_reason": "Wrong bill", "staff_id": 2 }`,
});
add({
  module: "POS",
  method: "GET",
  path: "/pos/customers/:customerId/credit-balance",
  permission: "credit:read",
  params: "customerId",
  response: `{ "data": { "balance": 100 } }`,
});
add({
  module: "POS",
  method: "GET",
  path: "/pos/customers/:customerId/credit-history",
  permission: "credit:read",
  params: "customerId",
});
add({
  module: "POS",
  method: "POST",
  path: "/pos/customers/credit/adjust",
  permission: "credit:adjust",
  request: `{ "customer_id", "amount", "type": "credit|debit", "notes" }`,
});

// ——— Dashboard ———
add({
  module: "Dashboard",
  method: "GET",
  path: "/dashboard/summary",
  permission: "dashboard:read",
  response: `{ "data": { "total_sales", "daily_sales", "monthly_sales", "low_stock_products", "vendor_wise_stock", "pending_vendor_payments", "top_selling_products" } }`,
});
add({
  module: "Dashboard",
  method: "GET",
  path: "/dashboard/low-stock",
  permission: "dashboard:read",
  query: "limit, threshold",
});
add({
  module: "Dashboard",
  method: "GET",
  path: "/dashboard/sales-chart",
  permission: "dashboard:read",
  query: "period=daily|monthly, from_date, to_date",
});

// ——— Reports ———
add({
  module: "Reports",
  method: "GET",
  path: "/reports/vendor",
  permission: "report:read",
  query: "from, to, vendor_id, vendor_name, pending_only, format=json|excel|pdf",
});
add({
  module: "Reports",
  method: "GET",
  path: "/reports/filters/vendors",
  permission: "Bearer",
});
add({
  module: "Reports",
  method: "GET",
  path: "/reports/in-depth",
  permission: "report:read",
  query: "from_date, to_date, product_id, bill_no, payment_type, staff_id, format",
});
add({
  module: "Reports",
  method: "GET",
  path: "/reports/bill-details",
  permission: "report:read",
  query: "from_date, to_date, filters..., format",
});
add({
  module: "Reports",
  method: "GET",
  path: "/reports/cancelled-bills",
  permission: "report:read",
  query: "from, to, product, bill_number, staff_id, payment_type, format",
});
add({
  module: "Reports",
  method: "GET",
  path: "/reports/daily",
  permission: "report:read",
  query: "from, to, from_date, to_date, date (single day), stock_no, stock_name, product_id, vendor_id, staff_id, bill_number, bill_no, payment_type, page, limit, format",
  response: "Rows: s_no, bill_no, date, product_name, stock_no, staff_name, cancelled_bill_history, payment_type_name, payment_amounts, bill_total; includes from_date, to_date",
});
add({
  module: "Reports",
  method: "GET",
  path: "/reports/filters/products",
  permission: "Bearer",
});
add({
  module: "Reports",
  method: "GET",
  path: "/reports/filters/staff",
  permission: "Bearer",
});
add({
  module: "Reports",
  method: "GET",
  path: "/reports/filters/payment-types",
  permission: "Bearer",
});

// ——— GST Reports ———
add({
  module: "GST Reports",
  method: "GET",
  path: "/gst-reports/summary",
  permission: "gst_report:read",
  query: "from, to, voucher_type=sale|return|all, gst_type=b2b|b2c|all, format=json|excel|csv|pdf",
  response: "Array of B2B/B2C grouped summary rows (Grand Total row included)",
});
add({
  module: "GST Reports",
  method: "GET",
  path: "/gst-reports/detailed",
  permission: "gst_report:read",
  query: "from, to, voucher_type, gst_type, format=json|excel|csv|pdf",
  response: "GST slab rows (report_rows) per invoice+HSN+rate; invoice_count = unique bills",
});
add({
  module: "GST Reports",
  method: "GET",
  path: "/gst-reports/reconciliation",
  permission: "gst_report:read",
  query: "from, to, voucher_type, gst_type",
  response: "Summary vs detailed totals reconciliation",
});
add({
  module: "GST Reports",
  method: "GET",
  path: "/gst-reports/sales",
  permission: "gst_report:read",
  query: "from_date, to_date, format=json|excel|pdf",
});
add({
  module: "GST Reports",
  method: "GET",
  path: "/gst-reports/purchase",
  permission: "gst_report:read",
  query: "from_date, to_date, format",
});
add({
  module: "GST Reports",
  method: "GET",
  path: "/gst-reports/hsn-summary",
  permission: "gst_report:read",
  query: "from_date, to_date, format",
});
add({
  module: "GST Reports",
  method: "GET",
  path: "/gst-reports/combined",
  permission: "gst_report:export",
  query: "from_date, to_date, format=excel",
  response: "Multi-sheet Excel workbook",
});

// Fix # column per module - renumber
const moduleCounts = {};
const finalRows = rows.map((r) => {
  moduleCounts[r.Module] = (moduleCounts[r.Module] || 0) + 1;
  return { ...r, "#": String(moduleCounts[r.Module]) };
});

// Sheet 1: API List
const ws1 = xlsx.utils.json_to_sheet(finalRows);
ws1["!cols"] = [
  { wch: 14 },
  { wch: 4 },
  { wch: 8 },
  { wch: 52 },
  { wch: 36 },
  { wch: 12 },
  { wch: 22 },
  { wch: 18 },
  { wch: 28 },
  { wch: 14 },
  { wch: 55 },
  { wch: 12 },
  { wch: 60 },
  { wch: 40 },
  { wch: 30 },
];

// Sheet 2: Response envelope reference
const refRows = [
  {
    Topic: "Base URL",
    Detail: BASE,
  },
  {
    Topic: "Auth Header",
    Detail: "Authorization: Bearer <accessToken>",
  },
  {
    Topic: "Success envelope",
    Detail: ENVELOPE_OK,
  },
  {
    Topic: "Error envelope",
    Detail: ENVELOPE_ERR,
  },
  {
    Topic: "HTTP codes",
    Detail: "200 OK | 400 Validation | 401 Unauthorized | 404 Not found | 423 Account locked | 500 Server error",
  },
  {
    Topic: "Bill number format",
    Detail: "BILL-YYYYMMDD-#### | RET-YYYYMMDD-####",
  },
  {
    Topic: "Default admin",
    Detail: "username: admin | password: admin123",
  },
];
const ws2 = xlsx.utils.json_to_sheet(refRows);
ws2["!cols"] = [{ wch: 22 }, { wch: 80 }];

// Sheet 3: Permissions list
const perms = [
  "auth:signin",
  "user:create",
  "user:read",
  "user:update",
  "user:delete",
  "roles:create",
  "roles:read",
  "roles:update",
  "roles:delete",
  "permissions:create",
  "permissions:read",
  "permissions:update",
  "permissions:delete",
  "sidebar:create",
  "sidebar:read",
  "sidebar:update",
  "sidebar:delete",
  "master:create",
  "master:read",
  "master:update",
  "master:delete",
  "design:create",
  "design:read",
  "design:update",
  "design:delete",
  "gst:create",
  "gst:read",
  "gst:update",
  "gst:delete",
  "vendor:create",
  "vendor:read",
  "vendor:update",
  "vendor:delete",
  "vendor_order:create",
  "vendor_order:read",
  "vendor_order:update",
  "vendor_order:delete",
  "vendor_payment:create",
  "vendor_payment:read",
  "vendor_payment:update",
  "vendor_payment:delete",
  "product:create",
  "product:read",
  "product:update",
  "product:delete",
  "inventory:adjust",
  "qr:read",
  "bulkupload",
  "pos:billing",
  "pos:check_quantity",
  "pos:bill_number",
  "pos:read",
  "pos:return",
  "pos:cancel",
  "credit:read",
  "credit:adjust",
  "dashboard:read",
  "report:read",
  "report:export",
  "gst_report:read",
  "gst_report:export",
].map((p) => ({ Permission: p }));

const ws3 = xlsx.utils.json_to_sheet(perms);

const wb = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(wb, ws1, "API List");
xlsx.utils.book_append_sheet(wb, ws2, "Reference");
xlsx.utils.book_append_sheet(wb, ws3, "Permissions");

const outPath = path.join(__dirname, "..", "docs", "Chettinad_Thari_API_List.xlsx");
xlsx.writeFile(wb, outPath);
console.log(`Generated ${finalRows.length} API rows -> ${outPath}`);
