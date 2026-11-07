import { afterEach, describe, expect, it, vi } from "vitest";
import { sendAuthEmail } from "./mailer";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sendAuthEmail", () => {
  it("logs the auth email with a greppable marker (no mail provider by design)", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    await sendAuthEmail({
      to: "owner@example.com",
      subject: "Verify your email",
      intro: "Click to verify.",
      url: "https://workbench.test/verify?token=abc",
    });

    expect(info).toHaveBeenCalledTimes(1);
    const logged = String(info.mock.calls[0][0]);
    expect(logged).toContain("[auth-mail]");
    expect(logged).toContain("owner@example.com");
    expect(logged).toContain("Verify your email");
    expect(logged).toContain("https://workbench.test/verify?token=abc");
  });
});
