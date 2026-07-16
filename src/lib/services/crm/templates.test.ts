import { describe, expect, it } from "vitest";
import { buildMergeVars, renderTemplate } from "./templates";

describe("renderTemplate", () => {
  it("replaces merge fields case-insensitively with whitespace tolerance", () => {
    const { text, missing } = renderTemplate("Hi {{ First_Name }}, greetings from {{company}}!", {
      first_name: "Ada",
      company: "Acme",
    });
    expect(text).toBe("Hi Ada, greetings from Acme!");
    expect(missing).toEqual([]);
  });

  it("renders unknown or empty fields as empty and reports them", () => {
    const { text, missing } = renderTemplate("Hi {{first_name}}{{nickname}}", {
      first_name: "",
    });
    expect(text).toBe("Hi ");
    expect(missing.sort()).toEqual(["first_name", "nickname"]);
  });

  it("leaves non-placeholder braces alone", () => {
    const { text } = renderTemplate("code {sample} {{name}}", { name: "X" });
    expect(text).toBe("code {sample} X");
  });
});

describe("buildMergeVars", () => {
  it("splits a lead's display name", () => {
    const vars = buildMergeVars("lead", {
      name: "Ada Byron Lovelace",
      company: "Analytical",
      email: "ada@x.com",
    });
    expect(vars.first_name).toBe("Ada");
    expect(vars.last_name).toBe("Byron Lovelace");
    expect(vars.company).toBe("Analytical");
  });

  it("uses a contact's account for the company field", () => {
    const vars = buildMergeVars("contact", {
      first_name: "Bill",
      last_name: "Lumbergh",
      email: "bill@initech.example",
      account: { name: "Initech" },
    });
    expect(vars.name).toBe("Bill Lumbergh");
    expect(vars.company).toBe("Initech");
  });
});
