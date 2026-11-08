import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({ sql: vi.fn() }));
vi.mock("@/lib/instagram", async (importOriginal) => {
  const actual = (await importOriginal<typeof import("@/lib/instagram")>()) as unknown as Record<string, unknown>;
  return {
    ...actual,
    createImageMediaContainer: vi.fn(),
    getContainerStatus: vi.fn(),
    publishMediaContainer: vi.fn(),
    fetchMediaPermalink: vi.fn(),
  };
});
vi.mock("@/lib/facebook-token", () => ({
  decryptToken: vi.fn((payload: string) => `dec:${payload}`),
  decryptYouTubeSecret: vi.fn(),
  decryptTikTokSecret: vi.fn(),
  encryptYouTubeSecret: vi.fn(),
  encryptTikTokSecret: vi.fn(),
}));

import { sql } from "@/lib/db";
import { publishInstagramImagePost, resolveInstagramAccount } from "./instagram";
import {
  createImageMediaContainer,
  fetchInstagramAccount,
  fetchMediaPermalink,
  getContainerStatus,
  InstagramApiError,
  publishMediaContainer,
} from "@/lib/instagram";

const sqlMock = sql as unknown as Mock;

const fetchMock = vi.spyOn(globalThis, "fetch");

function expectFailure(result: Awaited<ReturnType<typeof resolveInstagramAccount>>) {
  return result as { ok: false; reason?: string; detail?: string | null };
}
const fetchJson = (body: unknown, ok = true, status = 200) =>
  Promise.resolve({
    ok,
    status,
    json: async () => body,
  } as Response);

beforeEach(() => {
  sqlMock.mockReset();
  fetchMock.mockReset();
  vi.clearAllMocks();
});

describe("resolveInstagramAccount", () => {
  it("fails not_connected without a Facebook row", async () => {
    sqlMock.mockResolvedValue([]);
    const result = expectFailure(await resolveInstagramAccount("ws1"));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("not_connected");
  });

  it("fails scope_missing listing the missing scopes", async () => {
    sqlMock.mockImplementation(
      async () =>
        [
          {
            page_id: "p1",
            page_name: "NeuralVerse",
            access_token: "cipher",
            scopes: "pages_manage_posts",
          },
        ] as never);
    const result = await resolveInstagramAccount("ws1");
    expect(result).toMatchObject({
      ok: false,
      reason: "scope_missing",
      detail: "instagram_basic + instagram_content_publish",
    });
  });

  it("resolves through the Page probe and decrypts the token", async () => {
    sqlMock.mockImplementation(
      async () =>
        [
          {
            page_id: "p1",
            page_name: "NeuralVerse",
            access_token: "cipher",
            scopes:
              "pages_manage_posts,instagram_basic,instagram_content_publish",
          },
        ] as never);
    fetchMock.mockImplementation(() =>
      fetchJson({
        instagram_business_account: {
          id: "ig-1",
          username: "neuralverse",
          profile_picture_url: "https://cdn/picture.jpg",
        },
      })
    );

    const result = await resolveInstagramAccount("ws1");
    expect(result).toEqual({
      ok: true,
      account: {
        id: "ig-1",
        username: "neuralverse",
        picture: "https://cdn/picture.jpg",
      },
      accessToken: "dec:cipher",
      scopes: [
        "pages_manage_posts",
        "instagram_basic",
        "instagram_content_publish",
      ],
      pageId: "p1",
    });
  });

  it("flags a Page without a linked professional account", async () => {
    sqlMock.mockImplementation(
      async () =>
        [
          {
            page_id: "p1",
            page_name: "NeuralVerse",
            access_token: "cipher",
            scopes: "instagram_basic,instagram_content_publish",
          },
        ] as never);
    fetchMock.mockImplementation(() => fetchJson({ instagram_business_account: null }));
    const result = await resolveInstagramAccount("ws1");
    expect(expectFailure(result)).toMatchObject({ ok: false, reason: "no_ig_account" });
  });

  it("maps probe failures to probe_failed", async () => {
    sqlMock.mockImplementation(
      async () =>
        [
          {
            page_id: "p1",
            page_name: "NeuralVerse",
            access_token: "cipher",
            scopes: "instagram_basic,instagram_content_publish",
          },
        ] as never);
    fetchMock.mockImplementation(() => fetchJson({ error: { message: "boom" } }, false, 400));
    const result = await resolveInstagramAccount("ws1");
    expect(expectFailure(result)).toMatchObject({ ok: false, reason: "probe_failed" });
  });
});

describe("publishInstagramImagePost", () => {
  const account = { id: "ig-1", username: "neuralverse", picture: null };
  const base = {
    account,
    accessToken: "tok",
    imageUrl: "https://blob/image.jpg",
    caption: "Hello",
  };

  it("publishes a finished container and returns the permalink", async () => {
    (createImageMediaContainer as unknown as Mock).mockResolvedValue("c-1");
    (getContainerStatus as unknown as Mock).mockResolvedValue({
      statusCode: "FINISHED",
      statusMessage: null,
    });
    (publishMediaContainer as unknown as Mock).mockResolvedValue("m-9");
    (fetchMediaPermalink as unknown as Mock).mockResolvedValue("https://instagram.com/p/9");

    const result = await publishInstagramImagePost(base);
    expect(result).toEqual({ id: "m-9", permalink: "https://instagram.com/p/9" });
  });

  it("polls IN_PROGRESS before FINISHED", async () => {
    (createImageMediaContainer as unknown as Mock).mockResolvedValue("c-2");
    (getContainerStatus as unknown as Mock)
      .mockResolvedValueOnce({ statusCode: "IN_PROGRESS", statusMessage: null })
      .mockResolvedValueOnce({ statusCode: "FINISHED", statusMessage: null });
    (publishMediaContainer as unknown as Mock).mockResolvedValue("m-10");
    (fetchMediaPermalink as unknown as Mock).mockResolvedValue(null);

    const result = await publishInstagramImagePost({ ...base, pollMs: 1 });
    expect(result.id).toBe("m-10");
    expect(getContainerStatus).toHaveBeenCalledTimes(2);
  });

  it("surfaces ERROR containers with their status message", async () => {
    (createImageMediaContainer as unknown as Mock).mockResolvedValue("c-3");
    (getContainerStatus as unknown as Mock).mockResolvedValue({
      statusCode: "ERROR",
      statusMessage: "URL Exception",
    });

    await expect(publishInstagramImagePost({ ...base, pollMs: 1 })).rejects.toThrow(
      "URL Exception"
    );
  });

  it("times out with a retry hint when processing stalls", async () => {
    (createImageMediaContainer as unknown as Mock).mockResolvedValue("c-4");
    (getContainerStatus as unknown as Mock).mockResolvedValue({
      statusCode: "IN_PROGRESS",
      statusMessage: null,
    });

    await expect(
      publishInstagramImagePost({ ...base, deadlineMs: 1, pollMs: 1 })
    ).rejects.toThrow(/still processing/);
  });
});
