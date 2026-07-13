export const ROLE_NAMES = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
};

/** Normalize role name for comparison (e.g. "Super Admin" -> "superadmin"). */
export function normalizeRoleKey(roleName) {
  return String(roleName ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

export function isSuperAdminRole(roleName) {
  const key = normalizeRoleKey(roleName);
  return key === "superadmin" || key === "superadministrator";
}

export function isAdminRole(roleName) {
  return normalizeRoleKey(roleName) === "admin" && !isSuperAdminRole(roleName);
}
