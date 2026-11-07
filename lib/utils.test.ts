import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("joins class names, skipping falsy values", () => {
    expect(cn("a", false && "b", undefined, null, "c")).toBe("a c");
  });

  it("accepts conditional objects", () => {
    expect(cn("base", { hidden: true, block: false })).toBe("base hidden");
  });

  it("resolves Tailwind conflicts, keeping the last utility", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
    expect(cn("p-2", "px-4")).toBe("p-2 px-4");
  });

  it("keeps t-shirt shaped custom size tokens when merged with a text color", () => {
    // Custom tokens must follow the Tailwind size shape (text-2xs, text-2sm)
    // to survive tailwind-merge's font-size group.
    expect(cn("text-2xs", "text-red-500")).toBe("text-2xs text-red-500");
    expect(cn("text-2sm", "text-red-500")).toBe("text-2sm text-red-500");
  });

  it("drops non-standard text-* names when merged with a text color", () => {
    // Documented repo gotcha: names like text-micro are treated as font-size
    // utilities and silently removed by the merge. Do not "fix" this test
    // without changing how custom tokens are named.
    expect(cn("text-micro", "text-red-500")).toBe("text-red-500");
  });
});
