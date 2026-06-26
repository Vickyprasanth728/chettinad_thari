/**
 * Generates full Postman collection + environment.
 * Run: node scripts/generate-postman-collection.js
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "postman");

const SIGNIN_TEST = `if (pm.response.code === 200) {
  const j = pm.response.json();
  if (j.status && j.data) {
    if (j.data.accessToken) pm.collectionVariables.set("token", j.data.accessToken);
    if (j.data.refreshToken) pm.collectionVariables.set("refreshToken", j.data.refreshToken);
    if (j.data.user?.id) pm.collectionVariables.set("userId", j.data.user.id);
  }
}`;

const SAVE_ID_TEST = (varName, path = "data.id") => `if (pm.response.code === 200 || pm.response.code === 201) {
  const j = pm.response.json();
  const id = j.${path};
  if (id) pm.collectionVariables.set("${varName}", id);
}`;

const POS_SAVE_BILL_NO = `if (pm.response.code === 200 || pm.response.code === 201) {
  const j = pm.response.json();
  if (j.success && j.data?.bill?.billNo) pm.collectionVariables.set("billNo", j.data.bill.billNo);
}`;

const COLLECTION_VARS = [
  { key: "baseUrl", value: "http://localhost:8080/api/v1" },
  { key: "token", value: "" },
  { key: "refreshToken", value: "" },
  { key: "userId", value: "1" },
  { key: "roleId", value: "1" },
  { key: "permissionId", value: "1" },
  { key: "sidebarId", value: "1" },
  { key: "categoryId", value: "1" },
  { key: "productId", value: "1" },
  { key: "vendorId", value: "1" },
  { key: "billId", value: "1" },
  { key: "customerId", value: "1" },
  { key: "gstId", value: "1" },
  { key: "designId", value: "1" },
  { key: "gmasterId", value: "1" },
  { key: "orderId", value: "1" },
  { key: "paymentId", value: "1" },
  { key: "returnId", value: "1" },
  { key: "stockNo", value: "STK001" },
  { key: "billNo", value: "BILL-20260602-0001" },
];

function authHeader() {
  return [{ key: "Authorization", value: "Bearer {{token}}" }];
}

function jsonHeader() {
  return [
    ...authHeader(),
    { key: "Content-Type", value: "application/json" },
  ];
}

function request(name, method, urlPath, opts = {}) {
  const item = {
    name,
    request: {
      method,
      header: opts.noAuth
        ? [{ key: "Content-Type", value: "application/json" }]
        : opts.formdata
          ? authHeader()
          : jsonHeader(),
      url: opts.query
        ? {
            raw: `{{baseUrl}}${urlPath}?${opts.query}`,
            host: ["{{baseUrl}}"],
            path: urlPath.replace(/^\//, "").split("/"),
            query: opts.query.split("&").map((q) => {
              const [key, value] = q.split("=");
              return { key, value: value ?? "" };
            }),
          }
        : `{{baseUrl}}${urlPath}`,
    },
  };

  if (opts.description) {
    item.request.description = opts.description;
  }
  if (opts.body) {
    item.request.body = { mode: "raw", raw: JSON.stringify(opts.body, null, 2) };
  }
  if (opts.rawBody) {
    item.request.body = { mode: "raw", raw: opts.rawBody };
  }
  if (opts.formdata) {
    item.request.body = { mode: "formdata", formdata: opts.formdata };
  }
  if (opts.test) {
    item.event = [{ listen: "test", script: { exec: opts.test.split("\n"), type: "text/javascript" } }];
  }
  return item;
}

function folder(name, items, description) {
  const f = { name, item: items };
  if (description) f.description = description;
  return f;
}

function masterCrud(table, label, createBody, updateBody, listQuery = "page=1&limit=50") {
  const idVar = table === "design_master" ? "designId" : table === "gmaster" ? "gmasterId" : `${table}Id`;
  return [
    request(`List ${label}`, "GET", `/${table}`, { query: listQuery }),
    request(`Get ${label} by ID`, "GET", `/${table}`, { query: `id={{${idVar}}}` }),
    request(`Create ${label}`, "POST", `/${table}`, {
      body: createBody,
      test: SAVE_ID_TEST(idVar),
    }),
    request(`Update ${label}`, "PUT", `/${table}/{{${idVar}}}`, { body: updateBody }),
    request(`Delete ${label}`, "DELETE", `/${table}/{{${idVar}}}`),
    request(`Check Unique Field`, "POST", `/${table}/check-unique`, {
      body: { field: "name", value: "test-value" },
    }),
  ];
}

const collection = {
  info: {
    name: "Chettinad Thari API",
    description:
      "Complete API collection for Chettinad Thari POS & Inventory Management.\n\n" +
      "## Getting Started\n" +
      "1. Import the **Chettinad Thari — Local** environment.\n" +
      "2. Run **Auth → Sign In** (auto-saves `token`, `refreshToken`, `userId`).\n" +
      "3. Use other folders — all protected routes use `Authorization: Bearer {{token}}`.\n\n" +
      "## Folder Structure\n" +
      "- **Auth** — Login, refresh, logout, session\n" +
      "- **Users / Roles / Permissions / Sidebar** — Access control\n" +
      "- **Dashboard** — Summary widgets & charts\n" +
      "- **Reports / GST Reports** — Admin & tax reports\n" +
      "- **Categories / Masters / GST** — Master data\n" +
      "- **Products / Vendors** — Inventory & procurement\n" +
      "- **POS App / POS Billing** — Point of sale\n" +
      "- **Settings** — Receipt templates\n\n" +
      "Base URL: `{{baseUrl}}`",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  variable: COLLECTION_VARS,
  item: [
    folder("Auth", [
      request("Sign In", "POST", "/auth/signin", {
        noAuth: true,
        description: "Login with username & password. Saves token automatically.",
        rawBody: '{\n  "username": "admin",\n  "password": "admin123"\n}',
        test: SIGNIN_TEST,
      }),
      request("Forgot Password", "POST", "/auth/forgot-password", {
        noAuth: true,
        description: "Send password reset link to registered user email.",
        rawBody: '{\n  "email": "admin@example.com"\n}',
      }),
      request("Reset Password", "POST", "/auth/reset-password", {
        noAuth: true,
        description: "Set new password using token from reset email link.",
        rawBody: '{\n  "token": "paste-token-from-email-link",\n  "password": "newPassword123",\n  "confirm_password": "newPassword123"\n}',
      }),
      request("Refresh Token", "POST", "/auth/refresh-token", {
        noAuth: true,
        description: "Refresh expired access token using refresh token.",
        rawBody: '{\n  "refreshToken": "{{refreshToken}}",\n  "userid": {{userId}}\n}',
      }),
      request("Sign Out", "POST", "/auth/signout", {
        description: "Revoke refresh token and log out.",
      }),
      request("Me (Current Session)", "GET", "/auth/me", {
        description: "Get current user, permissions, and sidebar menu.",
      }),
    ], "Run **Sign In** first. Token is saved to collection variable `token`."),

    folder("Users", [
      request("List Users", "GET", "/users", {
        query: "page=1&limit=20&search=",
        description: "Paginated user list. Use `?id=` for single user.",
      }),
      request("Get User by ID", "GET", "/users", { query: "id={{userId}}" }),
      request("Staff List", "GET", "/users/staff-list", {
        description: "Billing staff + admin users (no permission check).",
      }),
      request("Create User", "POST", "/users", {
        body: {
          username: "staff01",
          password: "staff123",
          name: "Staff One",
          email: "staff01@test.com",
          mobileno: "9000000001",
          role_id: 2,
          status: 1,
        },
        test: SAVE_ID_TEST("userId"),
      }),
      request("Update User", "PUT", "/users/{{userId}}", {
        body: { name: "Staff One Updated", status: 1 },
      }),
      request("Delete User", "DELETE", "/users/{{userId}}"),
      request("Check Username Unique", "POST", "/users/username-unique", {
        noAuth: true,
        body: { username: "admin", exclude_id: null },
      }),
      request("Check Mobile Unique", "POST", "/users/mobile-unique", {
        noAuth: true,
        body: { mobileno: "9000000001" },
      }),
      request("Check Email Unique", "POST", "/users/email-unique", {
        noAuth: true,
        body: { email: "staff01@test.com" },
      }),
    ], "User management. Permission: `user:create`, `user:read`, `user:update`, `user:delete`."),

    folder("Roles", [
      request("List Roles", "GET", "/roles", { query: "page=1&limit=20&search=" }),
      request("Get Role by ID", "GET", "/roles", { query: "id={{roleId}}" }),
      request("Create Role", "POST", "/roles", {
        body: { name: "Test Role", status: 1, permissions: [1, 2, 3] },
        test: SAVE_ID_TEST("roleId"),
      }),
      request("Update Role", "PUT", "/roles/{{roleId}}", {
        body: { name: "Test Role Updated", permissions: [1, 2], status: 1 },
      }),
      request("Delete Role", "DELETE", "/roles/{{roleId}}"),
    ], "Role management with permission assignment. Permission: `roles:*`."),

    folder("Permissions", [
      request("List Permissions", "GET", "/permissions", { query: "page=1&limit=50&search=" }),
      request("Get Permission by ID", "GET", "/permissions", { query: "id={{permissionId}}" }),
      request("Create Permission", "POST", "/permissions", {
        body: { name: "test:action", status: 1 },
        test: SAVE_ID_TEST("permissionId"),
      }),
      request("Update Permission", "PUT", "/permissions/{{permissionId}}", {
        body: { name: "test:action_updated", status: 1 },
      }),
      request("Delete Permission", "DELETE", "/permissions/{{permissionId}}"),
    ], "Permission definitions. Permission: `permissions:*`."),

    folder("Sidebar", [
      request("List Sidebar Items", "GET", "/sidebar", { query: "page=1&limit=50&search=" }),
      request("Get Sidebar Item by ID", "GET", "/sidebar", { query: "id={{sidebarId}}" }),
      request("Create Sidebar Item", "POST", "/sidebar", {
        body: {
          name: "Test Menu",
          icon: "star",
          path: "/test",
          permission: 1,
          parent_permission: null,
          status: 1,
        },
        test: SAVE_ID_TEST("sidebarId"),
      }),
      request("Update Sidebar Item", "PUT", "/sidebar/{{sidebarId}}", {
        body: { name: "Test Menu Updated", icon: "star", path: "/test-updated", status: 1 },
      }),
      request("Delete Sidebar Item", "DELETE", "/sidebar/{{sidebarId}}"),
    ], "Navigation menu configuration. Permission: `sidebar:*`."),

    folder("Dashboard", [
      request("Summary", "GET", "/dashboard/summary", {
        description: "Sales totals, low stock count, vendor pending, top sellers.",
      }),
      request("Low Stock Products", "GET", "/dashboard/low-stock", { query: "limit=20" }),
      request("Sales Chart (Daily)", "GET", "/dashboard/sales-chart", {
        query: "period=daily&from=2026-06-01&to=2026-06-30",
      }),
      request("Sales Chart (Monthly)", "GET", "/dashboard/sales-chart", {
        query: "period=monthly&from=2026-01-01&to=2026-06-30",
      }),
    ], "Dashboard widgets. Permission: `dashboard:read`."),

    folder("Reports", [
      folder("Sales & Billing", [
        request("In-Depth Report (JSON)", "GET", "/reports/in-depth", {
          query: "format=json&from=2026-06-01&to=2026-06-30",
        }),
        request("In-Depth Report (Excel)", "GET", "/reports/in-depth", {
          query: "format=excel&from=2026-06-01&to=2026-06-30",
        }),
        request("Bill Details (JSON)", "GET", "/reports/bill-details", {
          query: "format=json&from=2026-06-01&to=2026-06-30",
        }),
        request("Bill Details (Excel)", "GET", "/reports/bill-details", {
          query: "format=excel&from=2026-06-01&to=2026-06-30",
        }),
        request("Cancelled Bills (JSON)", "GET", "/reports/cancelled-bills", {
          query: "format=json&from=2026-06-01&to=2026-06-30",
        }),
        request("Cancelled Bills (Excel)", "GET", "/reports/cancelled-bills", {
          query: "format=excel&from=2026-06-01&to=2026-06-30",
        }),
        request("Cancelled Bills (PDF)", "GET", "/reports/cancelled-bills", {
          query: "format=pdf&from=2026-06-01&to=2026-06-30",
        }),
        request("Cancelled Bills — Filtered", "GET", "/reports/cancelled-bills", {
          query: "format=json&from=2026-06-01&to=2026-06-30&staff_id=1&payment_type=cash&bill_number=INV",
        }),
        request("Daily Report (JSON)", "GET", "/reports/daily", {
          query: "format=json&from_date=2026-06-01&to_date=2026-06-30",
        }),
        request("Daily Report (Excel)", "GET", "/reports/daily", {
          query: "format=excel&from_date=2026-06-01&to_date=2026-06-30",
        }),
        request("Daily Report (PDF)", "GET", "/reports/daily", {
          query: "format=pdf&from_date=2026-06-01&to_date=2026-06-30",
        }),
        request("Daily Report — Filtered", "GET", "/reports/daily", {
          query: "format=json&from=2026-06-19&to=2026-06-25&stock_no=STK&vendor_id=1&staff_id=3&product_id=5&payment_type=cash",
        }),
      ]),
      folder("Vendor", [
        request("Vendor Report (JSON)", "GET", "/reports/vendor", {
          query: "format=json&from=2026-06-01&to=2026-06-30&pending_only=false",
        }),
        request("Vendor Report (Excel)", "GET", "/reports/vendor", {
          query: "format=excel&from=2026-06-01&to=2026-06-30",
        }),
      ]),
      folder("Filters", [
        request("Filter — Vendors", "GET", "/reports/filters/vendors"),
        request("Filter — Products", "GET", "/reports/filters/products"),
        request("Filter — Staff", "GET", "/reports/filters/staff"),
        request("Filter — Payment Types", "GET", "/reports/filters/payment-types"),
      ]),
    ], "Admin reports. Permission: `report:read`. Export via `format=excel|pdf`."),

    folder("GST Reports", [
      request("GST Summary (JSON)", "GET", "/gst-reports/summary", {
        query: "format=json&from=2026-06-01&to=2026-06-30&voucher_type=sale&gst_type=all",
      }),
      request("GST Summary (Excel)", "GET", "/gst-reports/summary", {
        query: "format=excel&from=2026-06-01&to=2026-06-30&voucher_type=sale&gst_type=all",
      }),
      request("GST Summary (CSV)", "GET", "/gst-reports/summary", {
        query: "format=csv&from=2026-06-01&to=2026-06-30&voucher_type=sale&gst_type=b2b",
      }),
      request("GST Detailed (JSON)", "GET", "/gst-reports/detailed", {
        query: "format=json&from=2026-06-01&to=2026-06-30&voucher_type=sale&gst_type=all",
      }),
      request("GST Detailed (PDF)", "GET", "/gst-reports/detailed", {
        query: "format=pdf&from=2026-06-01&to=2026-06-30&voucher_type=sale&gst_type=all",
      }),
      request("GST Reconciliation", "GET", "/gst-reports/reconciliation", {
        query: "from=2026-06-01&to=2026-06-30&voucher_type=sale&gst_type=all",
      }),
      request("GST Sales (JSON)", "GET", "/gst-reports/sales", {
        query: "format=json&from=2026-06-01&to=2026-06-30",
      }),
      request("GST Sales (Excel)", "GET", "/gst-reports/sales", {
        query: "format=excel&from=2026-06-01&to=2026-06-30",
      }),
      request("GST Purchase (JSON)", "GET", "/gst-reports/purchase", {
        query: "format=json&from=2026-06-01&to=2026-06-30",
      }),
      request("GST Purchase (Excel)", "GET", "/gst-reports/purchase", {
        query: "format=excel&from=2026-06-01&to=2026-06-30",
      }),
      request("HSN Summary (JSON)", "GET", "/gst-reports/hsn-summary", {
        query: "format=json&from=2026-06-01&to=2026-06-30",
      }),
      request("HSN Summary (Excel)", "GET", "/gst-reports/hsn-summary", {
        query: "format=excel&from=2026-06-01&to=2026-06-30",
      }),
      request("Combined Export (Excel)", "GET", "/gst-reports/combined", {
        query: "format=excel&from=2026-06-01&to=2026-06-30",
      }),
    ], "GST/tax reports. Permission: `gst_report:read`, `gst_report:export`."),

    folder("Categories", [
      request("List Categories", "GET", "/categories", {
        query: "page=1&limit=50&search=",
      }),
      request("List Categories (Tree)", "GET", "/categories", { query: "tree=true" }),
      request("Get Category by ID", "GET", "/categories", { query: "id={{categoryId}}" }),
      request("Category Dropdown", "GET", "/categories/dropdown"),
      request("Check Unique Name", "POST", "/categories/check-unique-name", {
        body: { name: "Sarees", parent_id: null },
      }),
      request("Create Category", "POST", "/categories", {
        body: { name: "Test Category", parent_id: null, status: 1 },
        test: SAVE_ID_TEST("categoryId"),
      }),
      request("Update Category", "PUT", "/categories/{{categoryId}}", {
        body: { name: "Test Category Updated", status: 1 },
      }),
      request("Delete Category", "DELETE", "/categories/{{categoryId}}"),
    ], "Product category hierarchy. Permission: `category:*`."),

    folder("GST", [
      request("List GST Slabs", "GET", "/gst", { query: "page=1&limit=50" }),
      request("Get GST by ID", "GET", "/gst", { query: "id={{gstId}}" }),
      request("Create GST Slab", "POST", "/gst", {
        body: { name: "GST 5%", tax: 5, type: "inclusive", status: 1 },
        test: SAVE_ID_TEST("gstId"),
      }),
      request("Update GST Slab", "PUT", "/gst/{{gstId}}", {
        body: { name: "GST 5% Updated", tax: 5, type: "exclusive" },
      }),
      request("Delete GST Slab", "DELETE", "/gst/{{gstId}}"),
    ], "GST tax slab master. Permission: `gst:*`."),

    folder("Masters", [
      folder("gmaster", masterCrud("gmaster", "gmaster", { name: "Product Category" }, { name: "Category Updated" })),
      folder("gmastervalue", [
        request("List gmastervalue", "GET", "/gmastervalue", {
          query: "gmaster_id={{gmasterId}}&page=1&limit=50",
        }),
        request("Create gmastervalue", "POST", "/gmastervalue", {
          body: { gmaster_id: "{{gmasterId}}", name: "Silk" },
        }),
        request("Update gmastervalue", "PUT", "/gmastervalue/1", {
          body: { gmaster_id: "{{gmasterId}}", name: "Pure Silk" },
        }),
        request("Delete gmastervalue", "DELETE", "/gmastervalue/1"),
      ]),
      folder("design_master", [
        request("List design_master", "GET", "/design_master", { query: "page=1&limit=50" }),
        request("Create design_master", "POST", "/design_master", {
          body: { design_code: "DES-001", design_details: "Chettinad pattern", status: 1 },
          test: SAVE_ID_TEST("designId"),
        }),
        request("Update design_master", "PUT", "/design_master/{{designId}}", {
          body: { design_details: "Updated pattern" },
        }),
        request("Delete design_master", "DELETE", "/design_master/{{designId}}"),
        request("Check Design Code Unique", "POST", "/design/check-unique-code", {
          body: { design_code: "DES-001" },
        }),
      ]),
      folder("size", masterCrud("size", "size", { name: "Free Size" }, { name: "Free Size Updated" })),
      folder("color", masterCrud("color", "color", { name: "Red" }, { name: "Maroon" })),
    ], "Generic master CRUD. Permission: `master:*`."),

    folder("Products", [
      folder("CRUD", [
        request("List Products", "GET", "/products", {
          query: "page=1&limit=20&search=&low_stock=false",
        }),
        request("List Products (Low Stock)", "GET", "/products", {
          query: "low_stock=true&page=1&limit=20",
        }),
        request("Get Product by ID", "GET", "/products", { query: "id={{productId}}" }),
        request("Product Stats", "GET", "/products/stats"),
        request("Check Product Name Unique", "POST", "/products/check-unique-name", {
          body: { product_name: "Postman Test Product", exclude_id: null },
        }),
        request("Create Product", "POST", "/products", {
          body: {
            stock_no: "STK-POSTMAN-001",
            product_name: "Postman Test Product",
            description: "Created via Postman",
            quantity: 10,
            retail_price: 1500,
            discount: 0,
            gst_id: 1,
            hsn_code: "5007",
            published: 1,
          },
          test: SAVE_ID_TEST("productId"),
        }),
        request("Update Product", "PUT", "/products/{{productId}}", {
          body: { product_name: "Postman Test Product Updated", retail_price: 1600 },
        }),
        request("Delete Product", "DELETE", "/products/{{productId}}"),
      ]),
      folder("Inventory", [
        request("Adjust Stock (Increase)", "POST", "/products/{{productId}}/adjust-stock", {
          body: { action: "increase", quantity: 5, reason: "Postman test" },
        }),
        request("Adjust Stock (Decrease)", "POST", "/products/{{productId}}/adjust-stock", {
          body: { action: "decrease", quantity: 2, reason: "Postman test" },
        }),
        request("Inventory Logs", "GET", "/products/inventory-logs", { query: "id={{productId}}" }),
        request("Check Quantity", "POST", "/products/check-quantity", {
          body: { id: "{{productId}}", quantity: 1 },
        }),
        request("Check Status (Public)", "POST", "/products/checkstatus", {
          noAuth: true,
          body: { products: [{ id: "{{productId}}" }] },
        }),
      ]),
      folder("Lookup & QR", [
        request("Get by Stock No", "GET", "/products/by-stock/{{stockNo}}"),
        request("QR Scan", "POST", "/products/qr-scan", {
          body: { stock_no: "{{stockNo}}" },
        }),
        request("QR Tag", "GET", "/products/qr-tag", { query: "id={{productId}}" }),
      ]),
      folder("POS Catalog", [
        request("POS Catalog", "GET", "/products/pos-catalog"),
        request("POS Search", "GET", "/products/search", { query: "q=saree" }),
        request("POS Search (In Stock)", "GET", "/products/search", {
          query: "q=saree&in_stock_only=true",
        }),
        request("Out of Stock List", "GET", "/products/out-of-stock", {
          query: "page=1&limit=20&search=",
        }),
      ]),
      folder("Bulk Upload", [
        request("Download Template", "GET", "/products/bulk-upload/template"),
        request("Bulk Upload", "POST", "/products/bulk-upload", {
          formdata: [{ key: "file", type: "file", src: [] }],
          description: "Select .xlsx file in Body → form-data → key `file`.",
        }),
      ]),
      folder("Images", [
        request("Upload Image", "POST", "/products/{{productId}}/images", {
          formdata: [
            { key: "image", type: "file", src: [] },
            { key: "imageseq", value: "1", type: "text" },
            { key: "is_primary", value: "1", type: "text" },
          ],
        }),
        request("Delete Image", "DELETE", "/products/{{productId}}/images/1"),
      ]),
    ], "Product & inventory management. Set `productId` after Create Product."),

    folder("Vendors", [
      folder("Vendor CRUD", [
        request("List Vendors", "GET", "/vendors", { query: "page=1&limit=20" }),
        request("Get Vendor by ID", "GET", "/vendors", { query: "id={{vendorId}}" }),
        request("Vendor Dropdown", "GET", "/vendors/dropdown"),
        request("Create Vendor", "POST", "/vendors", {
          body: {
            vendor_name: "Test Vendor",
            vendor_code: "V-PM-001",
            address: "Chennai",
            phone: "9876543210",
            email: "vendor@test.com",
            gst_number: "",
          },
          test: SAVE_ID_TEST("vendorId"),
        }),
        request("Update Vendor", "PUT", "/vendors/{{vendorId}}", {
          body: { vendor_name: "Test Vendor Updated" },
        }),
        request("Delete Vendor", "DELETE", "/vendors/{{vendorId}}"),
        request("Check Unique Code", "POST", "/vendors/check-unique-code", {
          body: { vendor_code: "V-PM-001" },
        }),
        request("Check Unique GST", "POST", "/vendors/check-unique-gst", {
          body: { gst_number: "33AAAAA0000A1Z5" },
        }),
      ]),
      folder("Balance", [
        request("Vendor Balance", "GET", "/vendors/{{vendorId}}/balance"),
        request("Balance Summary (All)", "GET", "/vendors/balance-summary"),
      ]),
      folder("Orders", [
        request("List Orders", "GET", "/vendors/orders/list", {
          query: "vendor_id={{vendorId}}&page=1&limit=20",
        }),
        request("Get Order by ID", "GET", "/vendors/orders/list", { query: "id={{orderId}}" }),
        request("Create Order", "POST", "/vendors/orders", {
          body: {
            vendor_id: "{{vendorId}}",
            bill_no: "VBILL-001",
            order_date: "2026-05-31",
            no_of_packages: 2,
            no_of_items: 50,
            total_value: 10000,
            gst_amount: 500,
          },
          test: SAVE_ID_TEST("orderId"),
        }),
        request("Update Order", "PUT", "/vendors/orders/{{orderId}}", {
          body: { total_value: 10500 },
        }),
        request("Delete Order", "DELETE", "/vendors/orders/{{orderId}}"),
      ]),
      folder("Payments", [
        request("List Payments", "GET", "/vendors/payments/list", {
          query: "vendor_id={{vendorId}}&page=1&limit=20",
        }),
        request("Get Payment by ID", "GET", "/vendors/payments/list", { query: "id={{paymentId}}" }),
        request("Create Payment", "POST", "/vendors/payments", {
          body: {
            vendor_id: "{{vendorId}}",
            vendor_order_id: "{{orderId}}",
            amount: 5000,
            notes: "High",
            payment_date: "2026-05-31",
          },
          test: SAVE_ID_TEST("paymentId"),
        }),
        request("Update Payment", "PUT", "/vendors/payments/{{paymentId}}", {
          body: { amount: 5500 },
        }),
        request("Delete Payment", "DELETE", "/vendors/payments/{{paymentId}}"),
      ]),
    ], "Vendor, orders & payments. Set `vendorId` after Create Vendor."),

    folder("POS App", [
      folder("Billing", [
        request("Next Bill Number", "GET", "/billing/next-bill-no"),
        request("Quote", "POST", "/billing/quote", {
          body: {
            billType: "POS",
            items: [{ productId: "{{productId}}", qty: 1, unitPrice: 1500, gstRate: 5, discount: 0 }],
            payments: [],
          },
        }),
        request("Check Stock", "POST", "/billing/check-stock", {
          body: { items: [{ productId: "{{productId}}", qty: 1 }] },
        }),
        request("Checkout", "POST", "/billing/checkout", {
          body: {
            billType: "POS",
            staffId: "{{userId}}",
            orderNumber: "ORD-PM-001",
            customer: { name: "Test Customer", mobile: "9876543210", email: "", gstNumber: "" },
            items: [{ productId: "{{productId}}", qty: 1, unitPrice: 1500, gstRate: 5, discount: 0 }],
            payments: [{ mode: "CASH", amount: 1500 }],
          },
          test: POS_SAVE_BILL_NO,
        }),
        request("Get Bill by Number", "GET", "/billing/{{billNo}}"),
      ]),
      folder("Cancel", [
        request("Cancel Quote", "POST", "/cancel/quote", {
          body: {
            parentBillNo: "{{billNo}}",
            cancellationReason: "Wrong item billed",
            items: [{ transactionId: 11, productId: "{{productId}}", qty: 1 }],
          },
        }),
        request("Cancel Checkout", "POST", "/cancel/checkout", {
          body: {
            parentBillNo: "{{billNo}}",
            staffId: "{{userId}}",
            settlementMode: "CREDIT",
            cancellationReason: "Wrong item billed",
            items: [
              { transactionId: 11, productId: "{{productId}}", qty: 1 },
              { transactionId: 12, productId: "{{productId}}", qty: 2 },
            ],
          },
        }),
      ]),
      folder("Returns", [
        request("Return Quote", "POST", "/returns/quote", {
          body: {
            parentBillNo: "{{billNo}}",
            items: [{ transactionId: 1, productId: "{{productId}}", qty: 1 }],
          },
        }),
        request("Return Checkout", "POST", "/returns/checkout", {
          body: {
            parentBillNo: "{{billNo}}",
            staffId: "{{userId}}",
            settlementMode: "CREDIT",
            items: [
              { transactionId: 1, productId: "{{productId}}", qty: 1 },
              { transactionId: 2, productId: "{{productId}}", qty: 1 },
            ],
          },
        }),
      ]),
      folder("Customers", [
        request("Search Customers", "GET", "/customers/search", { query: "q=987" }),
        request("Credit Wallet", "GET", "/customers/{{customerId}}/credit-wallet"),
        request("Apply Wallet Credit", "POST", "/customers/{{customerId}}/credit-wallet/apply", {
          body: { amount: 50 },
        }),
      ]),
      folder("POS Reports", [
        request("Daily Summary", "POST", "/reports/daily-summary"),
        request("GST Summary (Today)", "POST", "/reports/gst-summary"),
        request("Payment Modes (Today)", "POST", "/reports/payment-modes"),
      ]),
    ], "New POS app API. Responses use `{ success, data, error }` format."),

    folder("POS Billing (Admin)", [
      folder("Init & Billing", [
        request("POS Init", "GET", "/pos/init"),
        request("Preview Bill Number", "GET", "/pos/bill-number"),
        request("Check Billing Quantity", "POST", "/pos/check-quantity", {
          body: { items: [{ product_id: "{{productId}}", quantity: 1 }] },
        }),
        request("Create Bill", "POST", "/pos/billing", {
          body: {
            staff_id: "{{userId}}",
            manual_order_number: "ORD-PM-001",
            customer: { name: "Walk-in Customer", mobile: "9999999999", email: "", gst_number: "" },
            items: [{ product_id: "{{productId}}", quantity: 1, unit_price: 500, discount: 0 }],
            bill_discount: 0,
            credit_to_apply: 0,
            payments: [
              { method: "cash", amount: 250 },
              { method: "card", amount: 250 },
            ],
          },
          test: SAVE_ID_TEST("billId"),
        }),
        request("List Bills", "GET", "/pos/bills", {
          query: "page=1&limit=20&from=2026-06-01&to=2026-06-30",
        }),
        request("Get Bill", "GET", "/pos/bills/{{billId}}"),
        request("Print Receipt (HTML)", "GET", "/pos/bills/{{billId}}/print-receipt"),
        request("Invoice PDF", "GET", "/pos/bills/{{billId}}/invoice-pdf"),
        request("Cancel Bill", "POST", "/pos/cancel-bill", {
          body: {
            bill_id: "{{billId}}",
            cancellation_reason: "Postman test cancel",
            staff_id: "{{userId}}",
          },
        }),
      ]),
      folder("Returns", [
        request("Create Return", "POST", "/pos/return", {
          body: {
            parent_bill_id: "{{billId}}",
            items: [{ product_id: "{{productId}}", quantity: 1 }],
            reason: "Postman test return",
            refund_method: "credit",
          },
          test: SAVE_ID_TEST("returnId", "data.return_id || data.id"),
        }),
        request("List Returns", "GET", "/pos/returns", { query: "page=1&limit=20" }),
        request("Get Return", "GET", "/pos/returns/{{returnId}}"),
        request("Bill Returns List", "GET", "/pos/bills/{{billId}}/returns"),
      ]),
      folder("Customer Credit", [
        request("List Credit Wallets", "GET", "/pos/credit-wallets", { query: "page=1&limit=20" }),
        request("Credit Balance", "GET", "/pos/customers/{{customerId}}/credit-balance"),
        request("Credit History", "GET", "/pos/customers/{{customerId}}/credit-history"),
        request("Adjust Credit", "POST", "/pos/customers/credit/adjust", {
          body: {
            customer_id: "{{customerId}}",
            amount: 100,
            type: "credit",
            notes: "Manual adjustment",
          },
        }),
      ]),
    ], "Legacy admin POS panel. Permission: `pos:*`, `credit:*`."),

    folder("Settings", [
      request("List Receipt Templates", "GET", "/settings/receipt-html", {
        query: "page=1&limit=20&search=",
      }),
      request("Get Receipt Template by ID", "GET", "/settings/receipt-html", { query: "id=1" }),
      request("Create/Update Receipt Template", "PUT", "/settings/receipt-html", {
        body: {
          name: "Default Receipt",
          value: "<html><body><h1>Receipt</h1></body></html>",
        },
      }),
    ], "Receipt print template settings. Permission: `pos:read`, `master:update`."),
  ],
};

// Ensure Refresh Token has correct headers
const authFolder = collection.item.find((f) => f.name === "Auth");
const refresh = authFolder?.item?.find((x) => x.name === "Refresh Token");
if (refresh) {
  refresh.request.header = [{ key: "Content-Type", value: "application/json" }];
}

const environment = {
  id: "chettinad-thari-local",
  name: "Chettinad Thari — Local",
  values: COLLECTION_VARS.map((v) => ({ ...v, enabled: true })),
  _postman_variable_scope: "environment",
};

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const collectionPath = path.join(outDir, "Chettinad_Thari_API.postman_collection.json");
const envPath = path.join(outDir, "Chettinad_Thari_Local.postman_environment.json");

fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2));
fs.writeFileSync(envPath, JSON.stringify(environment, null, 2));

console.log("Written:", collectionPath);
console.log("Written:", envPath);
console.log("Folders:", collection.item.map((f) => f.name).join(", "));
