import type { UserRole } from "@/lib/types";

const CANONICAL_USER_ROLES = new Set<UserRole>(["REP", "MANAGER", "TEAM_LEAD", "SUPER_ADMIN"]);

export function normalizeUserRole(value: unknown): UserRole | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (CANONICAL_USER_ROLES.has(normalized as UserRole)) {
    return normalized as UserRole;
  }

  const collapsed = normalized.replace(/_/g, "");
  if (collapsed === "SUPERADMIN") return "SUPER_ADMIN";
  if (collapsed === "TEAMLEAD") return "TEAM_LEAD";

  return null;
}
