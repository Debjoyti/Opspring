import { describe, expect, it } from "vitest";
import { scoreLeadWithRules } from "./scoring";

describe("scoreLeadWithRules", () => {
  it("scores a rich, senior, referred lead high", () => {
    const { score, reason } = scoreLeadWithRules({
      name: "Priya Nair",
      company: "Wayne Enterprises",
      email: "priya@wayne.example",
      phone: "+1 555 0100",
      title: "VP of Engineering",
      source: "Referral",
      status: "qualified",
      activityCount: 4,
    });
    expect(score).toBeGreaterThanOrEqual(80);
    expect(reason).toContain("business email");
    expect(reason).toContain("senior title");
  });

  it("scores an empty lead low", () => {
    const { score } = scoreLeadWithRules({ name: "Mystery" });
    expect(score).toBeLessThanOrEqual(20);
  });

  it("penalizes unqualified leads and clamps at 0", () => {
    const { score } = scoreLeadWithRules({ name: "Tom", status: "unqualified" });
    expect(score).toBe(0);
  });

  it("treats free-mail addresses as weaker than business ones", () => {
    const free = scoreLeadWithRules({ name: "A", email: "a@gmail.com" });
    const business = scoreLeadWithRules({ name: "A", email: "a@acme.io" });
    expect(business.score).toBeGreaterThan(free.score);
  });

  it("caps the activity bonus and the total", () => {
    const { score } = scoreLeadWithRules({
      name: "Max",
      company: "Acme",
      email: "max@acme.io",
      phone: "555",
      title: "CEO",
      source: "referral",
      status: "qualified",
      activityCount: 50,
    });
    expect(score).toBeLessThanOrEqual(100);
  });
});
