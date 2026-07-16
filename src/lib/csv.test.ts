import { describe, expect, it } from "vitest";
import { csvToObjects, parseCsv, toCsv } from "./csv";

describe("parseCsv", () => {
  it("parses plain rows", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields with commas, quotes, and newlines", () => {
    const text = 'name,notes\n"Doe, Jane","She said ""hi""\nsecond line"';
    expect(parseCsv(text)).toEqual([
      ["name", "notes"],
      ["Doe, Jane", 'She said "hi"\nsecond line'],
    ]);
  });

  it("handles CRLF and trailing newlines", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("skips fully empty lines", () => {
    expect(parseCsv("a,b\n\n1,2\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("csvToObjects", () => {
  it("maps rows onto lowercase headers", () => {
    const { headers, rows } = csvToObjects("Name,Email\nAda,ada@x.com\nBob,");
    expect(headers).toEqual(["name", "email"]);
    expect(rows).toEqual([
      { name: "Ada", email: "ada@x.com" },
      { name: "Bob", email: "" },
    ]);
  });

  it("tolerates short rows", () => {
    const { rows } = csvToObjects("name,email\nAda");
    expect(rows).toEqual([{ name: "Ada", email: "" }]);
  });
});

describe("toCsv", () => {
  it("escapes values that need quoting and round-trips", () => {
    const csv = toCsv(["name", "notes"], [["Doe, Jane", 'said "hi"'], ["Bob", null]]);
    expect(parseCsv(csv)).toEqual([
      ["name", "notes"],
      ["Doe, Jane", 'said "hi"'],
      ["Bob", ""],
    ]);
  });
});
