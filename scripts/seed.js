import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { db, connectDB, setSessionDefaults } from "../config/Database.js";

dotenv.config();

const PERMISSIONS = [
  "auth:signin", "user:create", "user:read", "user:update", "user:delete",
  "roles:create", "roles:read", "roles:update", "roles:delete",
  "permissions:create", "permissions:read", "permissions:update", "permissions:delete",
  "sidebar:create", "sidebar:read", "sidebar:update", "sidebar:delete",
  "master:create", "master:read", "master:update", "master:delete",
  "design:create", "design:read", "design:update", "design:delete",
  "gst:create", "gst:read", "gst:update", "gst:delete",
  "category:create", "category:read", "category:update", "category:delete",
  "vendor:create", "vendor:read", "vendor:update", "vendor:delete",
  "vendor_order:create", "vendor_order:read", "vendor_order:update", "vendor_order:delete",
  "vendor_payment:create", "vendor_payment:read", "vendor_payment:update", "vendor_payment:delete",
  "product:create", "product:read", "product:update", "product:delete",
  "inventory:adjust", "qr:read", "bulkupload",
  "pos:billing", "pos:check_quantity", "pos:bill_number", "pos:read", "pos:return", "pos:cancel",
  "credit:read", "credit:adjust",
  "dashboard:read",
  "report:read", "report:export",
  "gst_report:read", "gst_report:export",
];

const ROLE_PERMISSIONS = {
  Admin: PERMISSIONS,
  "Billing Staff": [
    "auth:signin", "pos:billing", "pos:check_quantity", "pos:bill_number", "pos:read",
    "pos:return", "product:read", "qr:read", "user:read", "credit:read",
  ],
  "Inventory Staff": [
    "auth:signin", "product:create", "product:read", "product:update", "product:delete",
    "inventory:adjust", "qr:read", "bulkupload", "vendor:read", "design:read", "gst:read",
    "category:create", "category:read", "category:update", "category:delete", "master:read",
  ],
  "Accounts Staff": [
    "auth:signin", "vendor:read", "vendor_order:read", "vendor_order:create",
    "vendor_payment:create", "vendor_payment:read", "vendor_payment:update",
    "gst_report:read", "gst_report:export", "report:read", "report:export", "gst:read",
  ],
  Manager: [
    "auth:signin", "dashboard:read", "report:read", "report:export",
    "vendor:read", "product:read", "pos:read", "gst_report:read",
  ],
};

const SIDEBAR = [
  { name: "Dashboard", icon: "dashboard", path: "/dashboard", permission: "dashboard:read" },
  { name: "POS Billing", icon: "point_of_sale", path: "/pos", permission: "pos:billing" },
  { name: "Products", icon: "inventory", path: "/products", permission: "product:read" },
  { name: "Vendors", icon: "store", path: "/vendors", permission: "vendor:read" },
  { name: "Purchases & Returns", icon: "shopping_cart", path: "/purchases", permission: "product:read" },
  { name: "Vendor Orders", icon: "receipt_long", path: "/vendor-orders", permission: "vendor_order:read" },
  { name: "Reports", icon: "assessment", path: "/reports", permission: "report:read" },
  { name: "Vendor Report", icon: "description", path: "/reports/vendor", permission: "report:read", parent: "report:read" },
  { name: "In-depth Report", icon: "description", path: "/reports/in-depth", permission: "report:read", parent: "report:read" },
  { name: "Bill Details Report", icon: "description", path: "/reports/bill-details", permission: "report:read", parent: "report:read" },
  { name: "Cancelled Bills Report", icon: "description", path: "/reports/cancelled-bills", permission: "report:read", parent: "report:read" },
  { name: "Daily Report", icon: "description", path: "/reports/daily", permission: "report:read", parent: "report:read" },
  { name: "GST Sales", icon: "description", path: "/reports/gst-sales", permission: "gst_report:read", parent: "report:read" },
  { name: "GST Purchase", icon: "description", path: "/reports/gst-purchase", permission: "gst_report:read", parent: "report:read" },
  { name: "HSN Summary", icon: "description", path: "/reports/hsn-summary", permission: "gst_report:read", parent: "report:read" },
  { name: "GST Summary", icon: "description", path: "/reports/gst-summary", permission: "gst_report:read", parent: "report:read" },
  { name: "GST Detailed", icon: "description", path: "/reports/gst-detailed", permission: "gst_report:read", parent: "report:read" },
  { name: "Users", icon: "people", path: "/users", permission: "user:read" },
  { name: "Roles", icon: "admin_panel_settings", path: "/roles", permission: "roles:read" },
  { name: "Masters", icon: "settings", path: "/masters", permission: "master:read" },
  { name: "Design", icon: "palette", path: "/design", permission: "design:read", parent: "master:read" },
  { name: "Category", icon: "category", path: "/masters/category", permission: "category:read", parent: "master:read" },
  { name: "Subcategory", icon: "category", path: "/masters/subcategory", permission: "category:read", parent: "master:read" },
  { name: "GST", icon: "percent", path: "/gst", permission: "gst:read", parent: "master:read" },
];

async function seed() {
  await connectDB();
  await setSessionDefaults();

  for (const name of PERMISSIONS) {
    await db.query(
      `INSERT IGNORE INTO permissions (name, status) VALUES (?, 1)`,
      { replacements: [name] }
    );
  }

  const roleIds = {};
  for (const roleName of Object.keys(ROLE_PERMISSIONS)) {
    await db.query(`INSERT IGNORE INTO roles (name, status) VALUES (?, 1)`, {
      replacements: [roleName],
    });
    const [[role]] = await db.query(`SELECT id FROM roles WHERE name = ?`, {
      replacements: [roleName],
    });
    roleIds[roleName] = role.id;

    await db.query(`DELETE FROM rolepermission WHERE role_id = ?`, {
      replacements: [role.id],
    });

    for (const permName of ROLE_PERMISSIONS[roleName]) {
      const [[perm]] = await db.query(`SELECT id FROM permissions WHERE name = ?`, {
        replacements: [permName],
      });
      if (perm) {
        await db.query(
          `INSERT IGNORE INTO rolepermission (role_id, permission_id) VALUES (?, ?)`,
          { replacements: [role.id, perm.id] }
        );
      }
    }
  }

  const allPerms = await db.query(`SELECT id, name FROM permissions`);
  const permByName = Object.fromEntries(allPerms[0].map((p) => [p.name, p.id]));

  await db.query(`DELETE FROM sidebar`);
  for (const item of SIDEBAR) {
    const permId = permByName[item.permission];
    if (!permId) continue;
    const parentPermId = item.parent ? permByName[item.parent] : null;
    await db.query(
      `INSERT INTO sidebar (name, icon, path, permission, parent_permission, status) VALUES (?, ?, ?, ?, ?, 1)`,
      {
        replacements: [
          item.name,
          item.icon,
          item.path,
          permId,
          parentPermId ?? null,
        ],
      }
    );
  }

  const hashed = await bcrypt.hash("admin123", 10);
  await db.query(
    `INSERT INTO users (username, password, name, email, mobileno, role_id, status)
     VALUES (?, ?, ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE password = VALUES(password), role_id = VALUES(role_id)`,
    {
      replacements: [
        "admin",
        hashed,
        "System Admin",
        "admin@chettinad.com",
        "9876543210",
        roleIds.Admin,
      ],
    }
  );

  await db.query(
    `INSERT IGNORE INTO gst (name, tax, type, status) VALUES ('GST 5%', 5, 'inclusive', 1), ('GST 12%', 12, 'inclusive', 1), ('GST 18%', 18, 'inclusive', 1)`
  );

  console.log("Seed completed. Default login: admin / admin123");
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
