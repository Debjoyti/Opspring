import { describe, expect, it } from "vitest";
import { planRoundRobin } from "./assignment";

describe("planRoundRobin", () => {
  it("spreads a batch evenly across members", () => {
    const plan = planRoundRobin(
      ["l1", "l2", "l3", "l4"],
      [
        { userId: "u1", openCount: 0 },
        { userId: "u2", openCount: 0 },
      ],
    );
    const perUser = plan.reduce<Record<string, number>>((acc, a) => {
      acc[a.userId] = (acc[a.userId] ?? 0) + 1;
      return acc;
    }, {});
    expect(perUser).toEqual({ u1: 2, u2: 2 });
  });

  it("favors the least-loaded member first", () => {
    const plan = planRoundRobin(
      ["l1"],
      [
        { userId: "u1", openCount: 5 },
        { userId: "u2", openCount: 1 },
      ],
    );
    expect(plan).toEqual([{ leadId: "l1", userId: "u2" }]);
  });

  it("breaks ties deterministically by user id", () => {
    const plan = planRoundRobin(
      ["l1"],
      [
        { userId: "b", openCount: 2 },
        { userId: "a", openCount: 2 },
      ],
    );
    expect(plan[0].userId).toBe("a");
  });

  it("returns nothing when there are no members", () => {
    expect(planRoundRobin(["l1"], [])).toEqual([]);
  });
});
