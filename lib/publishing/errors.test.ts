import { describe, expect, it } from "vitest";
import { FacebookApiError } from "@/lib/facebook";
import { facebookErrorResponse } from "./errors";

async function shape(res: Awaited<ReturnType<typeof facebookErrorResponse>>) {
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("facebookErrorResponse", () => {
  it("maps permission-related Graph codes to 403 with a reconnect hint", async () => {
    for (const code of [10, 200, 190]) {
      const { status, body } = await shape(
        facebookErrorResponse(
          new FacebookApiError("access_token=abc broke", code),
          "publish_failed",
          "fallback"
        )
      );
      expect(status).toBe(403);
      expect(body).toEqual({
        error: "access_token=[redacted] broke Reconnect the Page to refresh its permissions.",
        code: "permission",
      });
    }
  });

  it("passes other Graph failures through as 502", async () => {
    const { status, body } = await shape(
      facebookErrorResponse(
        new FacebookApiError("singular statuses API is deprecated", 12),
        "cancel_failed",
        "fallback"
      )
    );
    expect(status).toBe(502);
    expect(body).toEqual({
      error: "singular statuses API is deprecated",
      code: "cancel_failed",
    });
  });

  it("redacts token material from plain errors at 500", async () => {
    const { status, body } = await shape(
      facebookErrorResponse(
        new Error("url had client_secret=hush inside"),
        "publish_failed",
        "fallback"
      )
    );
    expect(status).toBe(500);
    expect(body).toEqual({
      error: "url had client_secret=[redacted] inside",
      code: "publish_failed",
    });
  });

  it("falls back to the provided message for non-Error throws", async () => {
    const { status, body } = await shape(
      facebookErrorResponse("boom", "publish_failed", "Something went wrong.")
    );
    expect(status).toBe(500);
    expect(body).toEqual({ error: "Something went wrong.", code: "publish_failed" });
  });
});
