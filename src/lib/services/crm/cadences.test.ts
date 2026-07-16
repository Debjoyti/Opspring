import { describe, expect, it } from "vitest";
import { planEnrollmentTasks } from "./cadences";
import { cadenceInput } from "./types";

const enrolledAt = new Date("2026-07-16T10:00:00.000Z");

describe("planEnrollmentTasks", () => {
  it("materializes steps as dated open tasks in position order", () => {
    const tasks = planEnrollmentTasks(
      [
        { position: 1, day_offset: 2, activity_type: "email", subject: "Send intro email" },
        { position: 0, day_offset: 0, activity_type: "call", subject: "Intro call" },
        { position: 2, day_offset: 5, activity_type: "task", subject: "Follow up" },
      ],
      enrolledAt,
    );
    expect(tasks.map((t) => t.subject)).toEqual(["Intro call", "Send intro email", "Follow up"]);
    expect(tasks[0].due_at).toBe("2026-07-16T10:00:00.000Z");
    expect(tasks[1].due_at).toBe("2026-07-18T10:00:00.000Z");
    expect(tasks[2].due_at).toBe("2026-07-21T10:00:00.000Z");
    expect(tasks.every((t) => t.done === false)).toBe(true);
  });

  it("handles an empty cadence", () => {
    expect(planEnrollmentTasks([], enrolledAt)).toEqual([]);
  });

  it("breaks position ties by day offset", () => {
    const tasks = planEnrollmentTasks(
      [
        { position: 0, day_offset: 3, activity_type: "task", subject: "later" },
        { position: 0, day_offset: 1, activity_type: "task", subject: "sooner" },
      ],
      enrolledAt,
    );
    expect(tasks.map((t) => t.subject)).toEqual(["sooner", "later"]);
  });
});

describe("cadenceInput", () => {
  it("defaults step type to task and validates offsets", () => {
    const parsed = cadenceInput.parse({
      name: "Intro",
      steps: [{ subject: "Call", day_offset: 5 }],
    });
    expect(parsed.steps?.[0].activity_type).toBe("task");
    expect(() =>
      cadenceInput.parse({ name: "Bad", steps: [{ subject: "x", day_offset: 400 }] }),
    ).toThrow();
  });
});
