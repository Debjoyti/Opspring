import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "./assistant";

describe("buildSystemPrompt", () => {
  it("names the organization and the caller's role", () => {
    const prompt = buildSystemPrompt("Acme Inc", "admin");
    expect(prompt).toContain("Acme Inc");
    expect(prompt).toContain('"admin"');
  });

  it("scopes the assistant to only this organization", () => {
    const prompt = buildSystemPrompt("Acme Inc", "member");
    expect(prompt.toLowerCase()).toContain("only");
  });
});
