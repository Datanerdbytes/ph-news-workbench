import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/notifications", () => ({
  notifyPublishAttemptFailure: vi.fn(),
}));

import { FacebookApiError } from "@/lib/facebook";
import { notifyPublishAttemptFailure } from "@/lib/notifications";
import { facebookErrorResponse } from "./errors";

const notifyMock = notifyPublishAttemptFailure as unknown as Mock;

beforeEach(() => {
  notifyMock.mockClear();
});

async function shape(res: ReturnType<typeof facebookErrorResponse>) {
  const response = await res;
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
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

  it("without a notify context, records nothing in the bell", async () => {
    await shape(
      facebookErrorResponse(new FacebookApiError("boom", 1), "x", "fallback")
    );
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("with a notify context, records Graph failures with the response copy", async () => {
    const { body } = await shape(
      facebookErrorResponse(
        new FacebookApiError("Video upload is invalid", 6000),
        "reel_failed",
        "fallback",
        { workspaceId: "ws_1", kind: "reel" }
      )
    );
    expect(notifyMock).toHaveBeenCalledWith({
      workspaceId: "ws_1",
      kind: "reel",
      reason: body.error,
    });
  });

  it("permission rejections ring the bell with the reconnect hint", async () => {
    await shape(
      facebookErrorResponse(
        new FacebookApiError("must have an access_token", 190),
        "reel_failed",
        "fallback",
        { workspaceId: "ws_1", kind: "reel" }
      )
    );
    expect(notifyMock).toHaveBeenCalledWith({
      workspaceId: "ws_1",
      kind: "reel",
      reason:
        "must have an access_token Reconnect the Page to refresh its permissions.",
    });
  });
});
