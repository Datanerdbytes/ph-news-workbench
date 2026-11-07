import { describe, expect, it } from "vitest";
import { readPageIds, readText } from "./request";

describe("readPageIds", () => {
  it("keeps non-empty strings from an array", () => {
    expect(readPageIds(["p1", "", "p2", 42, null])).toEqual(["p1", "p2"]);
    expect(readPageIds([])).toEqual([]);
  });

  it("parses a JSON-encoded string", () => {
    expect(readPageIds('["p1","p2"]')).toEqual(["p1", "p2"]);
    // Only JSON arrays are honored — a bare JSON string parses to a string,
    // whose own JSON.parse then fails.
    expect(readPageIds('"p1"')).toEqual([]);
  });

  it("returns nothing for junk strings and other types", () => {
    expect(readPageIds("not json")).toEqual([]);
    expect(readPageIds("   ")).toEqual([]);
    expect(readPageIds(42)).toEqual([]);
    expect(readPageIds(null)).toEqual([]);
    expect(readPageIds(undefined)).toEqual([]);
  });
});

describe("readText", () => {
  it("trims strings and caps their length", () => {
    expect(readText("  hello  ")).toBe("hello");
    expect(readText("abcdef", 3)).toBe("abc");
  });

  it("returns an empty string for non-strings", () => {
    expect(readText(42)).toBe("");
    expect(readText(null)).toBe("");
  });
});
