import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({ sql: vi.fn() }));
vi.mock("rss-parser", () => ({
  default: class {
    parseURL = vi.fn();
  },
}));

import { sql } from "@/lib/db";
import { feedParser, ingestFeed, type IngestableFeed } from "@/lib/feeds";

const sqlMock = sql as unknown as Mock;
const parseURL = feedParser.parseURL as unknown as Mock;

const feed: IngestableFeed = {
  id: 7,
  workspace_id: "ws1",
  url: "https://example.com/rss.xml",
  title: "Old Title",
};

const item = {
  link: "https://example.com/story-a",
  title: "Story A",
  guid: "guid-a",
  contentSnippet: "snippet",
  pubDate: "Mon, 02 Nov 2026 10:00:00 GMT",
};

/**
 * Queue one result per `INSERT INTO news_items` call: rows mean the item was
 * new (RETURNING id fired), an empty array means the dedup conflict skipped it.
 */
function useDb(inserts: unknown[][] = []) {
  const queue = [...inserts];
  sqlMock.mockImplementation(async (strings: TemplateStringsArray) => {
    const query = strings.join(" ");
    if (query.includes("INSERT INTO news_items")) return queue.shift() ?? [];
    return [];
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  useDb();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ingestFeed", () => {
  it("counts inserted rows as ingested and conflicts as skipped", async () => {
    parseURL.mockResolvedValue({ title: "Feed", items: [item, item, item] });
    useDb([[{ id: 1 }], [], [{ id: 2 }]]);

    await expect(
      ingestFeed(feed, { correlationId: "c1", trigger: "cron" })
    ).resolves.toEqual({ ingested: 2, skipped: 1 });

    const finalUpdate = sqlMock.mock.calls.find((call) =>
      (call[0] as TemplateStringsArray).join(" ").includes("last_fetched_at")
    );
    expect(finalUpdate).toBeDefined();
  });

  it("updates the feed title only when the feed provides a better one", async () => {
    parseURL.mockResolvedValue({ title: "  Fresh Title  ", items: [] });
    await ingestFeed(feed, { correlationId: "c1", trigger: "manual" });

    const titleUpdate = sqlMock.mock.calls.find((call) =>
      (call[0] as TemplateStringsArray).join(" ").includes("SET title")
    );
    expect(titleUpdate![1]).toBe("Fresh Title");

    parseURL.mockResolvedValue({ title: " Old Title ", items: [] });
    sqlMock.mockClear();
    useDb();
    await ingestFeed(feed, { correlationId: "c2", trigger: "manual" });
    expect(
      sqlMock.mock.calls.some((call) =>
        (call[0] as TemplateStringsArray).join(" ").includes("SET title")
      )
    ).toBe(false);
  });

  it("hashes link|title for dedup and falls back for missing fields", async () => {
    parseURL.mockResolvedValue({
      items: [item, { link: "https://example.com/story-b", title: "Story B" }],
    });

    await ingestFeed(feed, { correlationId: "c1", trigger: "initial" });

    const inserts = sqlMock.mock.calls.filter((call) =>
      (call[0] as TemplateStringsArray).join(" ").includes("INSERT INTO news_items")
    );

    // First item: full fields, pubDate converted to a Date.
    expect(inserts[0].slice(1)).toEqual([
      7,
      "ws1",
      "guid-a",
      "https://example.com/story-a",
      "Story A",
      "snippet",
      new Date(item.pubDate),
      JSON.stringify(item),
      createHash("sha256")
        .update("https://example.com/story-a|Story A")
        .digest("hex"),
    ]);

    // Second item: no guid (falls back to the link) and no pubDate.
    const [, , guid, , , , pubDate] = inserts[1].slice(1);
    expect(guid).toBe("https://example.com/story-b");
    expect(pubDate).toBeNull();
  });

  it("records the error on the feed row and rethrows", async () => {
    parseURL.mockRejectedValue(new Error("network down"));

    await expect(
      ingestFeed(feed, { correlationId: "c1", trigger: "cron" })
    ).rejects.toThrow("network down");

    const errorUpdate = sqlMock.mock.calls.find((call) =>
      (call[0] as TemplateStringsArray).join(" ").includes("error_message")
    );
    expect(errorUpdate![1]).toBe("network down");
    expect(vi.mocked(console.error).mock.calls[0][0]).toContain("feed_error");
  });
});
