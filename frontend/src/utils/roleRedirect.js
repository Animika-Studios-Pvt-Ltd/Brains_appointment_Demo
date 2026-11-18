/** Normalize role from API user payload (type, userType, role, roles[]). */
export function normalizeRole(userOrRole) {
  if (!userOrRole) return "";
  if (typeof userOrRole === "string") {
    return userOrRole.toLowerCase().replace(/[\s_]/g, "");
  }
  const u = userOrRole;
  const raw =
    u.type ??
    u.userType ??
    u.role ??
    (Array.isArray(u.roles) && u.roles.length > 0 ? u.roles[0] : null) ??
    "";
  return String(raw).toLowerCase().replace(/[\s_]/g, "");
}

/** Dashboard path after login or visiting `/` while authenticated. */
export function getDashboardPathForUser(userOrRole) {
  const role = normalizeRole(userOrRole);
  if (!role) return "/patient/DoctorListPage";
  if (role.includes("superadmin") || role === "admin") return "/admin/dashboard";
  if (role === "doctor") return "/doctor/dashboard";
  if (role === "receptionist" || role === "callcenter") return "/receptionist/dashboard";
  if (role === "patient") return "/patient/DoctorListPage";
  return "/patient/DoctorListPage";
}

/** Profile menu "Dashboard" link (not the post-login landing page for patients). */
export function getAccountMenuDashboardPath(userOrRole) {
  const role = normalizeRole(userOrRole);
  if (!role) return "/patient/dashboard";
  if (role.includes("superadmin") || role === "admin") return "/admin/dashboard";
  if (role === "doctor") return "/doctor/dashboard";
  if (role === "receptionist" || role === "callcenter") return "/receptionist/dashboard";
  if (role === "patient") return "/patient/dashboard";
  return "/patient/dashboard";
}

export function getAccountMenuDashboardLabel(userOrRole) {
  return normalizeRole(userOrRole) === "patient" ? "Patient Dashboard" : "Dashboard";
}

export function isPatientAccount(userOrRole) {
  return normalizeRole(userOrRole) === "patient";
}

/** Show profile-menu dashboard link (patients: hide only on /patient/dashboard). */
export function shouldShowAccountDashboardLink(userOrRole, pathname) {
  const path = String(pathname || "").replace(/\/$/, "") || "/";
  const dashboardPath = getAccountMenuDashboardPath(userOrRole).replace(/\/$/, "");

  if (isPatientAccount(userOrRole)) {
    return path !== "/patient/dashboard";
  }

  if (!normalizeRole(userOrRole) && path.startsWith("/patient/")) {
    return path !== "/patient/dashboard";
  }

  return path !== dashboardPath;
}

export function isRoleAllowed(user, allowedRoles = []) {
  if (!allowedRoles.length) return true;
  const role = normalizeRole(user);
  if (!role) return false;
  const allowed = allowedRoles.map((r) =>
    String(r).toLowerCase().replace(/[\s_]/g, "")
  );
  if (allowed.includes(role)) return true;
  if (role === "callcenter" && allowed.includes("receptionist")) return true;
  return false;
}
