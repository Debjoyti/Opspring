import { describe, expect, it } from "vitest";
import { decodeOrgRoles } from "./claims";

function fakeAccessToken(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${header}.${payload}.signature`;
}

describe("decodeOrgRoles", () => {
  it("reads the org_roles claim", () => {
    const orgId = "11111111-1111-1111-1111-111111111111";
    const token = fakeAccessToken({ org_roles: { [orgId]: "owner" } });

    expect(decodeOrgRoles(token)).toEqual({ [orgId]: "owner" });
  });

  it("drops entries with an invalid role, keeping valid ones", () => {
    const validOrg = "11111111-1111-1111-1111-111111111111";
    const invalidOrg = "22222222-2222-2222-2222-222222222222";
    const token = fakeAccessToken({
      org_roles: { [validOrg]: "member", [invalidOrg]: "superadmin" },
    });

    expect(decodeOrgRoles(token)).toEqual({ [validOrg]: "member" });
  });

  it("returns {} for a missing token", () => {
    expect(decodeOrgRoles(undefined)).toEqual({});
  });

  it("returns {} for a malformed token instead of throwing", () => {
    expect(decodeOrgRoles("not-a-jwt")).toEqual({});
  });

  it("returns {} when the claim is absent", () => {
    const token = fakeAccessToken({ sub: "user-id" });
    expect(decodeOrgRoles(token)).toEqual({});
  });
});
