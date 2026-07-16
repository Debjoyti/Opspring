import { describe, expect, it } from "vitest";
import { actionApplicable, ruleMatches } from "./automation";
import { automationRuleInput } from "./types";

describe("ruleMatches", () => {
  const base = { enabled: true, trigger_event: "lead_created" as const, condition_stage_id: null };

  it("fires for its own event", () => {
    expect(ruleMatches(base, "lead_created", { entityType: "lead", entityId: "x" })).toBe(true);
  });

  it("ignores other events and disabled rules", () => {
    expect(ruleMatches(base, "deal_created", { entityType: "deal", entityId: "x" })).toBe(false);
    expect(
      ruleMatches({ ...base, enabled: false }, "lead_created", { entityType: "lead", entityId: "x" }),
    ).toBe(false);
  });

  it("respects the stage condition for deal_stage_changed", () => {
    const rule = {
      enabled: true,
      trigger_event: "deal_stage_changed" as const,
      condition_stage_id: "stage-1",
    };
    const payload = { entityType: "deal" as const, entityId: "d1" };
    expect(ruleMatches(rule, "deal_stage_changed", { ...payload, stageId: "stage-1" })).toBe(true);
    expect(ruleMatches(rule, "deal_stage_changed", { ...payload, stageId: "stage-2" })).toBe(false);
  });

  it("fires on any stage when no condition is set", () => {
    const rule = {
      enabled: true,
      trigger_event: "deal_stage_changed" as const,
      condition_stage_id: null,
    };
    expect(
      ruleMatches(rule, "deal_stage_changed", { entityType: "deal", entityId: "d", stageId: "s9" }),
    ).toBe(true);
  });
});

describe("actionApplicable", () => {
  it("round robin only applies to new leads", () => {
    expect(actionApplicable("assign_round_robin", "lead_created")).toBe(true);
    expect(actionApplicable("assign_round_robin", "deal_created")).toBe(false);
    expect(actionApplicable("assign_round_robin", "invoice_paid")).toBe(false);
  });

  it("tasks apply everywhere; tags only to taggable entities", () => {
    expect(actionApplicable("create_task", "invoice_paid")).toBe(true);
    expect(actionApplicable("add_tags", "deal_stage_changed")).toBe(true);
    expect(actionApplicable("add_tags", "quote_accepted")).toBe(false);
  });
});

describe("automationRuleInput", () => {
  it("accepts a full rule and defaults task due days", () => {
    const parsed = automationRuleInput.parse({
      name: "Intake",
      trigger_event: "lead_created",
      actions: [
        { type: "assign_round_robin" },
        { type: "create_task", subject: "Call the lead" },
      ],
    });
    expect(parsed.enabled).toBe(true);
    const task = parsed.actions.find((a) => a.type === "create_task");
    expect(task && "due_in_days" in task && task.due_in_days).toBe(3);
  });

  it("rejects unknown action types and empty action lists", () => {
    expect(() =>
      automationRuleInput.parse({
        name: "x",
        trigger_event: "lead_created",
        actions: [{ type: "send_email" }],
      }),
    ).toThrow();
    expect(() =>
      automationRuleInput.parse({ name: "x", trigger_event: "lead_created", actions: [] }),
    ).toThrow();
  });
});
