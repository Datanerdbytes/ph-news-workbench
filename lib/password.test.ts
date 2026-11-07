import { describe, expect, it } from "vitest";
import { validateNewPassword } from "./password";

describe("validateNewPassword", () => {
  it("requires at least 8 characters", () => {
    expect(validateNewPassword("short", "short")).toBe(
      "Use at least 8 characters for the new password."
    );
  });

  it("requires the confirmation to match", () => {
    expect(validateNewPassword("longenough1", "longenough2")).toBe(
      "The two passwords don't match."
    );
  });

  it("accepts a matching pair", () => {
    expect(validateNewPassword("longenough1", "longenough1")).toBeNull();
  });
});
