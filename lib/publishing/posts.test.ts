import { afterEach, describe, expect, it, vi } from "vitest";
import { publishTextPost } from "./posts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Flatten the FormData a Graph POST carried. */
function formOf(call: unknown[]): Record<string, string> {
  const form = (call[1] as { body: FormData }).body;
  const entries: Record<string, string> = {};
  for (const [key, value] of form.entries()) entries[key] = String(value);
  return entries;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("publishTextPost", () => {
  it("posts to the page feed with the message and link, then reads the permalink", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "post1" }))
      .mockResolvedValueOnce(
        jsonResponse({ permalink_url: "https://fb.com/permalink" })
      );
    vi.stubGlobal("fetch", mock);

    await expect(
      publishTextPost({
        pageId: "pg1",
        accessToken: "tok",
        message: "Big story",
        link: "https://example.com/a",
      })
    ).resolves.toEqual({ id: "post1", permalink: "https://fb.com/permalink" });

    const postUrl = new URL(String(mock.mock.calls[0][0]));
    expect(postUrl.pathname).toBe("/v23.0/pg1/feed");
    expect(formOf(mock.mock.calls[0])).toMatchObject({
      message: "Big story",
      link: "https://example.com/a",
      access_token: "tok",
    });

    const permalinkUrl = new URL(String(mock.mock.calls[1][0]));
    expect(permalinkUrl.pathname).toBe("/v23.0/post1");
    expect(permalinkUrl.searchParams.get("fields")).toBe("permalink_url");
  });

  it("adds Facebook scheduling fields when a time is given", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "post1" }))
      .mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal("fetch", mock);

    await publishTextPost({
      pageId: "pg1",
      accessToken: "tok",
      message: "Later",
      scheduledPublishTime: 1_800_000_000,
    });

    const form = formOf(mock.mock.calls[0]);
    expect(form.published).toBe("false");
    expect(form.scheduled_publish_time).toBe("1800000000");
    expect(form.link).toBeUndefined();
  });

  it("keeps the post when its permalink cannot be read", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "post1" }))
      .mockResolvedValueOnce(
        jsonResponse({ error: { message: "nope", code: 190 } }, 400)
      );
    vi.stubGlobal("fetch", mock);

    await expect(
      publishTextPost({ pageId: "pg1", accessToken: "tok", message: "hi" })
    ).resolves.toEqual({ id: "post1", permalink: null });
  });
});
