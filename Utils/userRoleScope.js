import { isAdminRole, isSuperAdminRole } from "../config/roleConfig.js";

const SUPER_ADMIN_ROLE_KEY = "superadmin";

/**
 * SQL scope for listing users based on the caller's role.
 * Super Admin: all users
 * Admin: all users except Super Admin
 * Others: same role only
 */
export function buildUserListScope(caller) {
  const callerRoleName = caller?.role_name;
  const callerRoleId = caller?.role_id ?? caller?.role;

  if (isSuperAdminRole(callerRoleName)) {
    return { clause: "", params: [] };
  }

  if (isAdminRole(callerRoleName)) {
    return {
      clause: ` AND LOWER(REPLACE(r.name, ' ', '')) != ?`,
      params: [SUPER_ADMIN_ROLE_KEY],
    };
  }

  return {
    clause: " AND u.role_id = ?",
    params: [callerRoleId],
  };
}

export function canAccessUser(caller, targetUser) {
  if (!targetUser) return false;

  const callerRoleName = caller?.role_name;

  if (isSuperAdminRole(callerRoleName)) return true;

  if (isAdminRole(callerRoleName)) {
    return !isSuperAdminRole(targetUser.role_name);
  }

  const callerRoleId = Number(caller?.role_id ?? caller?.role);
  return callerRoleId === Number(targetUser.role_id);
}

export function canAssignRoleById(caller, targetRoleId, targetRoleName) {
  const callerRoleName = caller?.role_name;

  if (isSuperAdminRole(callerRoleName)) return true;

  if (isAdminRole(callerRoleName)) {
    return !isSuperAdminRole(targetRoleName);
  }

  const callerRoleId = Number(caller?.role_id ?? caller?.role);
  return callerRoleId === Number(targetRoleId);
}

/**
 * SQL scope for listing roles based on the caller's role.
 * Super Admin: all roles
 * Admin: all roles except Super Admin
 * Others: own role only
 */
export function buildRoleListScope(caller) {
  const callerRoleName = caller?.role_name;
  const callerRoleId = caller?.role_id ?? caller?.role;

  if (isSuperAdminRole(callerRoleName)) {
    return { clause: "", params: [] };
  }

  if (isAdminRole(callerRoleName)) {
    return {
      clause: ` AND LOWER(REPLACE(name, ' ', '')) != ?`,
      params: [SUPER_ADMIN_ROLE_KEY],
    };
  }

  return {
    clause: " AND id = ?",
    params: [callerRoleId],
  };
}

export function canAccessRole(caller, targetRole) {
  if (!targetRole) return false;

  const callerRoleName = caller?.role_name;

  if (isSuperAdminRole(callerRoleName)) return true;

  if (isAdminRole(callerRoleName)) {
    return !isSuperAdminRole(targetRole.name);
  }

  const callerRoleId = Number(caller?.role_id ?? caller?.role);
  return callerRoleId === Number(targetRole.id);
}
