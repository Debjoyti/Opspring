import { describe, expect, it } from "vitest";
import { buildMergePatch, findDuplicateGroups } from "./dedupe";

describe("findDuplicateGroups", () => {
  it("groups by normalized email", () => {
    const groups = findDuplicateGroups([
      { id: "1", name: "Ada", email: "Ada@X.com" },
      { id: "2", name: "Ada Lovelace", email: "ada@x.com " },
      { id: "3", name: "Bob", email: "bob@y.com" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ field: "email", ids: ["1", "2"] });
  });

  it("groups by phone digits regardless of formatting", () => {
    const groups = findDuplicateGroups([
      { id: "1", name: "A", phone: "+1 (555) 010-1234" },
      { id: "2", name: "B", phone: "15550101234" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].field).toBe("phone");
  });

  it("groups by case-insensitive name", () => {
    const groups = findDuplicateGroups([
      { id: "1", name: "Jane Doe" },
      { id: "2", name: "jane doe" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].field).toBe("name");
  });

  it("does not duplicate a group when email and name both match", () => {
    const groups = findDuplicateGroups([
      { id: "1", name: "Ada", email: "ada@x.com" },
      { id: "2", name: "Ada", email: "ada@x.com" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].field).toBe("email");
  });

  it("ignores short phone fragments and blank emails", () => {
    const groups = findDuplicateGroups([
      { id: "1", name: "A", phone: "123", email: "" },
      { id: "2", name: "B", phone: "123", email: "" },
    ]);
    expect(groups).toHaveLength(0);
  });
});

describe("buildMergePatch", () => {
  it("fills only the primary's empty fields", () => {
    const patch = buildMergePatch(
      { id: "1", email: "keep@x.com", phone: null, title: "" },
      [
        { id: "2", email: "lose@x.com", phone: "555", title: "CEO" },
        { id: "3", phone: "999" },
      ],
      ["email", "phone", "title"],
    );
    expect(patch).toEqual({ phone: "555", title: "CEO" });
  });

  it("unions tags across all records", () => {
    const patch = buildMergePatch(
      { id: "1", tags: ["a"] },
      [{ id: "2", tags: ["b", "a"] }],
      [],
    );
    expect(patch.tags).toEqual(["a", "b"]);
  });
});
