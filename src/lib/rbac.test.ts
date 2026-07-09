import { describe, expect, it } from "vitest";
import { assertRole, isOrgRole, roleHasPermission } from "./rbac";

describe("isOrgRole", () => {
  it("accepts known roles", () => {
    expect(isOrgRole("owner")).toBe(true);
    expect(isOrgRole("guest")).toBe(true);
  });

  it("rejects unknown or non-string values", () => {
    expect(isOrgRole("superadmin")).toBe(false);
    expect(isOrgRole(null)).toBe(false);
    expect(isOrgRole(undefined)).toBe(false);
    expect(isOrgRole(42)).toBe(false);
  });
});

describe("roleHasPermission", () => {
  it("owner and admin can manage members", () => {
    expect(roleHasPermission("owner", "members:invite")).toBe(true);
    expect(roleHasPermission("admin", "members:remove")).toBe(true);
  });

  it("member cannot manage members or update the org", () => {
    expect(roleHasPermission("member", "members:invite")).toBe(false);
    expect(roleHasPermission("member", "org:update")).toBe(false);
    expect(roleHasPermission("member", "members:view")).toBe(true);
  });

  it("guest has no permissions", () => {
    expect(roleHasPermission("guest", "members:view")).toBe(false);
  });
});

describe("assertRole", () => {
  it("returns true only when role is in the allowed list", () => {
    expect(assertRole("owner", ["owner", "admin"])).toBe(true);
    expect(assertRole("member", ["owner", "admin"])).toBe(false);
    expect(assertRole(null, ["owner", "admin"])).toBe(false);
  });
});
