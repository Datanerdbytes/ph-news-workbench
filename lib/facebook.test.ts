import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FACEBOOK_SCOPES,
  FacebookApiError,
  MAX_POST_IMAGES,
  buildAuthorizationUrl,
  cancelFacebookScheduledPost,
  facebookConfigured,
  facebookGraphVersion,
  facebookRedirectUri,
  graphDelete,
  graphRequest,
  fetchInstagramOverview,
  fetchPageTopPosts,
  isFacebookLiveStarted,
  isFacebookPostPublished,
  isFacebookStillScheduled,
  isFacebookVideoPublished,
  parseImages,
  redactTokens,
  selectPage,
  toArrayBuffer,
  type ConnectedFacebookPage,
} from "./facebook";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function graphError(code: number, message = "Graph error"): Response {
  return jsonResponse({ error: { message, code } }, 400);
}

const fetchMock = () => {
  const mock = vi.fn();
  vi.stubGlobal("fetch", mock);
  return mock;
};

function lastRequestedUrl(mock: ReturnType<typeof vi.fn>): URL {
  return new URL(String(mock.mock.calls.at(-1)![0]));
}

describe("facebookConfigured", () => {
  it("requires both app id and app secret", () => {
    vi.stubEnv("FACEBOOK_APP_ID", "id");
    vi.stubEnv("FACEBOOK_APP_SECRET", "secret");
    expect(facebookConfigured()).toBe(true);

    vi.stubEnv("FACEBOOK_APP_SECRET", "   ");
    expect(facebookConfigured()).toBe(false);
  });
});

describe("facebookGraphVersion", () => {
  it("defaults to v23.0", () => {
    vi.stubEnv("FACEBOOK_GRAPH_VERSION", "");
    expect(facebookGraphVersion()).toBe("v23.0");
  });

  it("rejects malformed versions", () => {
    for (const bad of ["23.0", "vX", "v", "v23"]) {
      vi.stubEnv("FACEBOOK_GRAPH_VERSION", bad);
      expect(facebookGraphVersion()).toBe("v23.0");
    }
  });

  it("accepts a well-formed override", () => {
    vi.stubEnv("FACEBOOK_GRAPH_VERSION", "v21.0");
    expect(facebookGraphVersion()).toBe("v21.0");
  });
});

describe("facebookRedirectUri", () => {
  it("prefers the explicit redirect URI", () => {
    vi.stubEnv("FACEBOOK_REDIRECT_URI", "https://cb.example.com/x");
    expect(facebookRedirectUri()).toBe("https://cb.example.com/x");
  });

  it("derives the callback from BETTER_AUTH_URL", () => {
    vi.stubEnv("FACEBOOK_REDIRECT_URI", "");
    vi.stubEnv("BETTER_AUTH_URL", "https://app.example.com");
    expect(facebookRedirectUri()).toBe(
      "https://app.example.com/api/facebook/callback"
    );
  });

  it("falls back to localhost when nothing valid is configured", () => {
    vi.stubEnv("FACEBOOK_REDIRECT_URI", "");
    vi.stubEnv("BETTER_AUTH_URL", "not a url");
    expect(facebookRedirectUri()).toBe(
      "http://localhost:3000/api/facebook/callback"
    );
  });
});

describe("buildAuthorizationUrl", () => {
  it("requests the expected OAuth dialog parameters", () => {
    vi.stubEnv("FACEBOOK_APP_ID", "app123");
    vi.stubEnv("FACEBOOK_REDIRECT_URI", "https://app.example.com/cb");

    const url = new URL(buildAuthorizationUrl("state-xyz"));
    expect(url.origin + url.pathname).toBe(
      "https://www.facebook.com/v23.0/dialog/oauth"
    );
    expect(url.searchParams.get("client_id")).toBe("app123");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example.com/cb"
    );
    expect(url.searchParams.get("state")).toBe("state-xyz");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe(FACEBOOK_SCOPES.join(","));
  });
});

describe("selectPage", () => {
  const pages: ConnectedFacebookPage[] = [
    { id: "p1", name: "First", accessToken: "t1", picture: null },
    { id: "p2", name: "Second", accessToken: "t2", picture: null },
  ];

  it("returns the pinned page when present", () => {
    expect(selectPage(pages, "p2")?.id).toBe("p2");
  });

  it("returns null when the pinned page is missing", () => {
    expect(selectPage(pages, "p9")).toBeNull();
  });

  it("falls back to the first page, and null for an empty list", () => {
    expect(selectPage(pages)?.id).toBe("p1");
    expect(selectPage([])).toBeNull();
  });
});

describe("parseImages", () => {
  it("accepts only http(s) URLs and data URLs", () => {
    expect(
      parseImages([
        "https://example.com/a.jpg",
        "data:image/jpeg;base64,QUJD",
        "data:image/webp;base64,QUJD",
        "data:image/avif;base64,QUJD",
        "ftp://nope",
        "just text",
        42,
      ])
    ).toEqual([
      { url: "https://example.com/a.jpg" },
      { base64: "QUJD", type: "image/jpeg", filename: "post.jpg" },
      { base64: "QUJD", type: "image/webp", filename: "post.webp" },
      { base64: "QUJD", type: "image/avif", filename: "post.png" },
    ]);
  });

  it("returns nothing for non-array input", () => {
    expect(parseImages("https://example.com/a.jpg")).toEqual([]);
    expect(parseImages(null)).toEqual([]);
  });

  it("caps images at MAX_POST_IMAGES", () => {
    const urls = Array.from(
      { length: MAX_POST_IMAGES + 3 },
      (_, i) => `https://example.com/${i}.jpg`
    );
    expect(parseImages(urls)).toHaveLength(MAX_POST_IMAGES);
  });
});

describe("redactTokens", () => {
  it("masks token material in error messages", () => {
    const message =
      "bad request: access_token=abc123&fb_exchange_token=xyz&client_secret=hush";
    expect(redactTokens(message)).toBe(
      "bad request: access_token=[redacted]&fb_exchange_token=[redacted]&client_secret=[redacted]"
    );
  });
});

describe("toArrayBuffer", () => {
  it("copies exactly the viewed byte range", () => {
    const view = Buffer.from([9, 1, 2, 3]).subarray(1, 3);
    expect(Array.from(new Uint8Array(toArrayBuffer(view)))).toEqual([1, 2]);
  });
});

describe("graphRequest", () => {
  it("returns the parsed body on success", async () => {
    const mock = fetchMock().mockResolvedValue(jsonResponse({ hello: "world" }));
    await expect(graphRequest("me", {}, "tok")).resolves.toEqual({
      hello: "world",
    });
    const url = new URL(String(mock.mock.calls[0][0]));
    expect(url.pathname).toBe("/v23.0/me");
    expect(url.searchParams.get("access_token")).toBe("tok");
  });

  it("throws FacebookApiError with the Graph code", async () => {
    fetchMock().mockResolvedValue(graphError(190, "Session expired"));
    await expect(graphRequest("me", {}, "tok")).rejects.toMatchObject({
      name: "FacebookApiError",
      message: "Session expired",
      code: 190,
    });
  });

  it("maps network failures to a reachability error", async () => {
    fetchMock().mockRejectedValue(new Error("ECONNRESET"));
    await expect(graphRequest("me", {}, "tok")).rejects.toThrow(
      "Facebook could not be reached."
    );
  });

  it("reports an empty body instead of failing silently", async () => {
    fetchMock().mockResolvedValue(new Response("not json", { status: 200 }));
    await expect(graphRequest("me", {}, "tok")).rejects.toThrow(
      "Facebook returned an empty response."
    );
  });
});

describe("graphDelete", () => {
  it("issues a DELETE and returns the body", async () => {
    const mock = fetchMock().mockResolvedValue(jsonResponse({ success: true }));
    await expect(graphDelete("pg1_post1", "tok")).resolves.toEqual({
      success: true,
    });
    const url = new URL(String(mock.mock.calls[0][0]));
    expect(url.pathname).toBe("/v23.0/pg1_post1");
    expect(mock.mock.calls[0][1]).toMatchObject({ method: "DELETE" });
  });
});

describe("publish-state probes", () => {
  it("isFacebookVideoPublished trusts is_published first", async () => {
    fetchMock().mockResolvedValue(
      jsonResponse({ is_published: true, status: { video_status: "ready" } })
    );
    await expect(isFacebookVideoPublished("v1", "tok")).resolves.toBe(true);
  });

  it("isFacebookVideoPublished maps video_status", async () => {
    const status = async (videoStatus: string) => {
      fetchMock().mockResolvedValue(
        jsonResponse({ status: { video_status: videoStatus } })
      );
      return isFacebookVideoPublished("v1", "tok");
    };
    await expect(status("ready")).resolves.toBe(true);
    await expect(status("complete")).resolves.toBe(true);
    await expect(status("error")).resolves.toBe(false);
    await expect(status("processing")).resolves.toBeNull();
  });

  it("treats Graph code 100 as unknown instead of throwing", async () => {
    // Fresh response per call: a Response body can only be read once.
    fetchMock().mockImplementation(async () => graphError(100, "Unknown fields"));
    await expect(isFacebookVideoPublished("v1", "tok")).resolves.toBeNull();
    await expect(isFacebookPostPublished("p1", "tok")).resolves.toBeNull();
    await expect(isFacebookLiveStarted("l1", "tok")).resolves.toBeNull();
  });

  it("rethrows other Graph errors", async () => {
    fetchMock().mockResolvedValue(graphError(190, "Session expired"));
    await expect(isFacebookPostPublished("p1", "tok")).rejects.toBeInstanceOf(
      FacebookApiError
    );
  });

  it("isFacebookPostPublished reads the published flag", async () => {
    fetchMock().mockResolvedValue(jsonResponse({ published: false }));
    await expect(isFacebookPostPublished("p1", "tok")).resolves.toBe(false);
    fetchMock().mockResolvedValue(jsonResponse({}));
    await expect(isFacebookPostPublished("p1", "tok")).resolves.toBeNull();
  });

  it("isFacebookLiveStarted maps stream status", async () => {
    const status = async (value: string) => {
      fetchMock().mockResolvedValue(jsonResponse({ status: value }));
      return isFacebookLiveStarted("l1", "tok");
    };
    await expect(status("LIVE_NOW")).resolves.toBe(true);
    await expect(status("vod")).resolves.toBe(true);
    await expect(status("ERROR")).resolves.toBe(false);
    // UNPUBLISHED / SCHEDULED / WAITING are still pending, not failures.
    await expect(status("UNPUBLISHED")).resolves.toBe(false);
    await expect(status("")).resolves.toBeNull();
  });
});

describe("cancelFacebookScheduledPost", () => {
  it("deletes reel/video containers via the compound id first", async () => {
    const mock = fetchMock().mockResolvedValue(jsonResponse({ success: true }));
    await cancelFacebookScheduledPost("ctr1", "tok", "pg1");
    expect(mock).toHaveBeenCalledTimes(1);
    expect(lastRequestedUrl(mock).pathname).toBe("/v23.0/pg1_ctr1");
  });

  it("falls back to the bare id when the compound form is refused", async () => {
    const mock = fetchMock()
      .mockResolvedValueOnce(graphError(12, "singular statuses API is deprecated"))
      .mockResolvedValueOnce(jsonResponse({ success: true }));
    await cancelFacebookScheduledPost("ctr1", "tok", "pg1");
    expect(mock).toHaveBeenCalledTimes(2);
    expect(lastRequestedUrl(mock).pathname).toBe("/v23.0/ctr1");
  });

  it("surfaces the compound-form error when both attempts fail", async () => {
    fetchMock()
      .mockResolvedValueOnce(graphError(12, "compound failed"))
      .mockResolvedValueOnce(graphError(100, "bare failed"));
    await expect(cancelFacebookScheduledPost("ctr1", "tok", "pg1")).rejects.toThrow(
      "compound failed"
    );
  });

  it("uses the bare id without a page and for already-compound ids", async () => {
    const mock = fetchMock().mockImplementation(async () =>
      jsonResponse({ success: true })
    );
    await cancelFacebookScheduledPost("ctr1", "tok", null);
    expect(lastRequestedUrl(mock).pathname).toBe("/v23.0/ctr1");

    await cancelFacebookScheduledPost("pg1_ctr1", "tok", "pg1");
    expect(lastRequestedUrl(mock).pathname).toBe("/v23.0/pg1_ctr1");
    expect(mock).toHaveBeenCalledTimes(2);
  });
});

describe("isFacebookStillScheduled", () => {
  async function queueWith(
    ids: string[],
    pageId: string,
    postId: string
  ): Promise<boolean | null> {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ data: ids.map((id) => ({ id })) }))
    );
    return isFacebookStillScheduled(pageId, postId, "tok");
  }

  it("matches compound, bare, and suffixed queue entries", async () => {
    await expect(queueWith(["pg1_ctr1"], "pg1", "ctr1")).resolves.toBe(true);
    await expect(queueWith(["ctr1"], "pg1", "ctr1")).resolves.toBe(true);
    await expect(queueWith(["other_ctr1"], "pg1", "ctr1")).resolves.toBe(true);
  });

  it("reports absence and unreadable edges distinctly", async () => {
    await expect(queueWith(["pg1_other"], "pg1", "ctr1")).resolves.toBe(false);

    fetchMock().mockResolvedValue(graphError(190, "Session expired"));
    await expect(isFacebookStillScheduled("pg1", "ctr1", "tok")).resolves.toBeNull();
  });
});

describe("fetchPageTopPosts", () => {
  it("maps posts and retries without summaries when the edge rejects them", async () => {
    const mock = fetchMock();
    mock
      .mockResolvedValueOnce(graphError(10, "needs pages_read_user_content"))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "p1",
              message: "Hello",
              permalink_url: "https://facebook.com/p1",
              created_time: "2026-11-10T04:17:11+0000",
              shares: { count: 2 },
            },
          ],
        })
      );

    const posts = await fetchPageTopPosts("page-1", "tok");
    expect(posts).toEqual([
      {
        id: "p1",
        message: "Hello",
        permalinkUrl: "https://facebook.com/p1",
        createdAt: "2026-11-10T04:17:11+0000",
        shares: 2,
        reactions: null,
        comments: null,
      },
    ]);
    expect(mock).toHaveBeenCalledTimes(2);
    const firstUrl = new URL(String(mock.mock.calls[0][0]));
    const retryUrl = new URL(String(mock.mock.calls[1][0]));
    expect(firstUrl.searchParams.get("fields")).toContain("likes.summary");
    expect(retryUrl.searchParams.get("fields")).not.toContain("summary");
  });

  it("keeps reaction and comment counts when summaries are granted", async () => {
    const mock = fetchMock();
    mock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            id: "p1",
            created_time: "2026-11-10T04:17:11+0000",
            likes: { summary: { total_count: 7 } },
            comments: { summary: { total_count: 1 } },
          },
        ],
      })
    );

    const posts = await fetchPageTopPosts("page-1", "tok");
    expect(posts[0]).toMatchObject({ reactions: 7, comments: 1 });
    expect(mock).toHaveBeenCalledTimes(1);
  });
});

describe("fetchInstagramOverview", () => {
  it("returns null when the page has no linked Instagram account", async () => {
    fetchMock().mockResolvedValue(jsonResponse({ id: "page-1" }));
    await expect(fetchInstagramOverview("page-1", "tok")).resolves.toBeNull();
  });

  it("maps the account snapshot and recent media", async () => {
    const mock = fetchMock();
    mock
      .mockResolvedValueOnce(
        jsonResponse({
          instagram_business_account: {
            id: "ig-1",
            username: "neuralverse",
            followers_count: 95,
            media_count: 73,
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "m1",
              caption: "Reel caption",
              permalink: "https://instagram.com/reel/m1",
              timestamp: "2025-10-21T16:07:44+0000",
              media_type: "VIDEO",
              like_count: 3,
              comments_count: 0,
            },
          ],
        })
      );

    const overview = await fetchInstagramOverview("page-1", "tok");
    expect(overview).toMatchObject({
      username: "neuralverse",
      followers: 95,
      mediaCount: 73,
    });
    expect(overview?.recent[0]).toMatchObject({
      id: "m1",
      mediaType: "VIDEO",
      likes: 3,
      comments: 0,
    });
    expect(lastRequestedUrl(mock).pathname).toBe("/v23.0/ig-1/media");
  });
});
