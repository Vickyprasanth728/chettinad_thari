/**
 * Grant category:* permissions to Admin and any role that has master:read.
 * Run once if you see "Missing permission: category:read":
 *   node scripts/grant-category-permissions.js
 */
import dotenv from "dotenv";
import { db, connectDB } from "../config/Database.js";

dotenv.config();

const CATEGORY_PERMS = [
  "category:create",
  "category:read",
  "category:update",
  "category:delete",
];

async function grant() {
  await connectDB();

  for (const name of CATEGORY_PERMS) {
    await db.query(`INSERT IGNORE INTO permissions (name, status) VALUES (?, 1)`, {
      replacements: [name],
    });
  }

  const [roles] = await db.query(
    `SELECT DISTINCT r.id, r.name FROM roles r
     WHERE r.status = 1 AND (
       r.name = 'Admin'
       OR EXISTS (
         SELECT 1 FROM rolepermission rp
         JOIN permissions p ON p.id = rp.permission_id
         WHERE rp.role_id = r.id AND p.name = 'master:read'
       )
     )`
  );

  for (const role of roles) {
    for (const permName of CATEGORY_PERMS) {
      const [[perm]] = await db.query(`SELECT id FROM permissions WHERE name = ?`, {
        replacements: [permName],
      });
      if (!perm) continue;
      await db.query(
        `INSERT IGNORE INTO rolepermission (role_id, permission_id) VALUES (?, ?)`,
        { replacements: [role.id, perm.id] }
      );
    }
    console.log(`Granted category permissions → role: ${role.name} (id ${role.id})`);
  }

  console.log("Done. Log out and sign in again to refresh your session.");
  process.exit(0);
}

grant().catch((e) => {
  console.error(e);
  process.exit(1);
});
