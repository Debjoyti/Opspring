import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({})),
}));

const mockGetVerifiedUserAndRoles = vi.fn();
vi.mock("@/lib/supabase/claims", () => ({
  getVerifiedUserAndRoles: (...args: unknown[]) => mockGetVerifiedUserAndRoles(...args),
}));

const { withOrgAuth } = await import("./handler");

const ORG_ID = "11111111-1111-1111-1111-111111111111";

function request(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/v1/test", { headers });
}

describe("withOrgAuth", () => {
  it("rejects with 401 when there is no authenticated user", async () => {
    mockGetVerifiedUserAndRoles.mockResolvedValueOnce({ user: null, orgRoles: {} });

    const handler = withOrgAuth(() => new Response("ok"));
    const res = await handler(request());

    expect(res.status).toBe(401);
  });

  it("rejects with 400 when the x-org-id header is missing", async () => {
    mockGetVerifiedUserAndRoles.mockResolvedValueOnce({
      user: { id: "user-1" },
      orgRoles: { [ORG_ID]: "owner" },
    });

    const handler = withOrgAuth(() => new Response("ok"));
    const res = await handler(request());

    expect(res.status).toBe(400);
  });

  it("rejects with 403 when the user is not a member of the requested org", async () => {
    mockGetVerifiedUserAndRoles.mockResolvedValueOnce({
      user: { id: "user-1" },
      orgRoles: {},
    });

    const handler = withOrgAuth(() => new Response("ok"));
    const res = await handler(request({ "x-org-id": ORG_ID }));

    expect(res.status).toBe(403);
  });

  it("rejects with 403 when the member's role is not in requiredRoles", async () => {
    mockGetVerifiedUserAndRoles.mockResolvedValueOnce({
      user: { id: "user-1" },
      orgRoles: { [ORG_ID]: "member" },
    });

    const handler = withOrgAuth(() => new Response("ok"), { requiredRoles: ["owner", "admin"] });
    const res = await handler(request({ "x-org-id": ORG_ID }));

    expect(res.status).toBe(403);
  });

  it("calls the handler with resolved context when authorized", async () => {
    mockGetVerifiedUserAndRoles.mockResolvedValueOnce({
      user: { id: "user-1" },
      orgRoles: { [ORG_ID]: "owner" },
    });

    const inner = vi.fn((_req: Request, ctx: { userId: string; orgId: string; role: string }) => {
      expect(ctx).toMatchObject({ userId: "user-1", orgId: ORG_ID, role: "owner" });
      return new Response("ok");
    });

    const handler = withOrgAuth(inner, { requiredRoles: ["owner", "admin"] });
    const res = await handler(request({ "x-org-id": ORG_ID }));

    expect(inner).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
  });
});
