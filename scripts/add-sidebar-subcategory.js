/**
 * Add Subcategory under Masters in sidebar (after Category). Safe to run multiple times.
 *   node scripts/add-sidebar-subcategory.js
 */
import dotenv from "dotenv";
import { db, connectDB } from "../config/Database.js";

dotenv.config();

async function run() {
  await connectDB();

  const [[masterPerm]] = await db.query(
    `SELECT id FROM permissions WHERE name = 'master:read' LIMIT 1`
  );
  const [[catPerm]] = await db.query(
    `SELECT id FROM permissions WHERE name = 'category:read' LIMIT 1`
  );
  if (!masterPerm || !catPerm) {
    console.error("Missing master:read or category:read permission. Run seed first.");
    process.exit(1);
  }

  const [[existing]] = await db.query(
    `SELECT id FROM sidebar WHERE path = '/masters/subcategory' AND status = 1 LIMIT 1`
  );
  if (existing) {
    console.log("Subcategory sidebar entry already exists.");
    process.exit(0);
  }

  await db.query(
    `INSERT INTO sidebar (name, icon, path, permission, parent_permission, status)
     VALUES ('Subcategory', 'category', '/masters/subcategory', ?, ?, 1)`,
    { replacements: [catPerm.id, masterPerm.id] }
  );

  console.log("Added Subcategory to sidebar under Masters.");
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
