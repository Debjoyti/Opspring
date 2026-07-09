export const ORG_ROLES = ["owner", "admin", "manager", "member", "guest"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export type Permission =
  | "org:update"
  | "members:invite"
  | "members:remove"
  | "members:view";

/**
 * Seed permission matrix for the foundation phase. Extend as real modules
 * (CRM/HRMS/etc.) land — this is intentionally small, not the full spec's
 * Super Admin..Guest matrix, which needs real actions to model against.
 */
const ROLE_PERMISSIONS: Record<OrgRole, ReadonlySet<Permission>> = {
  owner: new Set(["org:update", "members:invite", "members:remove", "members:view"]),
  admin: new Set(["org:update", "members:invite", "members:remove", "members:view"]),
  manager: new Set(["members:view"]),
  member: new Set(["members:view"]),
  guest: new Set([]),
};

export function isOrgRole(value: unknown): value is OrgRole {
  return typeof value === "string" && (ORG_ROLES as readonly string[]).includes(value);
}

export function roleHasPermission(role: OrgRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function assertRole(
  role: OrgRole | null,
  allowed: readonly OrgRole[],
): role is OrgRole {
  return role !== null && allowed.includes(role);
}
