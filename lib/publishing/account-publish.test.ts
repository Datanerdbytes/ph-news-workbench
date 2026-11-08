import { describe, expect, it, vi } from "vitest";

const { notifyWorkspace } = vi.hoisted(() => ({
  notifyWorkspace: vi.fn(),
}));

vi.mock("@/lib/notifications", async () => {
  const actual = await import("@/lib/notifications");
  return { ...actual, notifyWorkspace };
});

import { FacebookApiError } from "@/lib/facebook";
import { publishToAccount, type AccountTarget } from "./crosspost";

const account: AccountTarget = {
  platform: "youtube",
  id: "UC123",
  name: "NeuralVerse",
  accessToken: "ya29.token",
};

describe("publishToAccount", () => {
  it("projects the publish result on success without ringing the bell", async () => {
    const outcome = await publishToAccount({
      account,
      publish: async () => ({ id: "vid-1", permalink: "https://youtu.be/vid-1" }),
      workspaceId: "ws1",
      kind: "youtube-video",
    });

    expect(outcome).toEqual({
      ok: true,
      id: "vid-1",
      permalink: "https://youtu.be/vid-1",
    });
    expect(notifyWorkspace).not.toHaveBeenCalled();
  });

  it("records the failure in the bell using the platform kind label", async () => {
    const outcome = await publishToAccount({
      account,
      publish: async () => {
        throw new Error("Quota exceeded for uploads today.");
      },
      workspaceId: "ws1",
      kind: "youtube-video",
    });

    expect(outcome).toEqual({
      ok: false,
      error: "Quota exceeded for uploads today.",
    });
    expect(notifyWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws1",
        type: "publish_failed",
        title: "YouTube video could not be published",
        link: "/youtube",
      })
    );
  });

  it("marks token rejections when the provider classifier fires", async () => {
    const rejection = (error: unknown) =>
      error instanceof FacebookApiError && error.code === 190;

    const outcome = await publishToAccount({
      account,
      publish: async () => {
        throw new FacebookApiError("jwt expired", 190);
      },
      workspaceId: "ws1",
      kind: "tiktok-video",
      isTokenRejection: rejection,
    });

    expect(outcome).toMatchObject({
      ok: false,
      rejected: true,
      error: "jwt expired",
    });
  });

  it("skips the bell without workspace context", async () => {
    const outcome = await publishToAccount({
      account,
      publish: async () => {
        throw new Error("Upload failed.");
      },
    });
    expect(outcome.ok).toBe(false);
    expect(notifyWorkspace).not.toHaveBeenCalled();
  });
});
