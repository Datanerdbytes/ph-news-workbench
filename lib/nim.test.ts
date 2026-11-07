import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({ sql: vi.fn() }));

import { sql } from "@/lib/db";
import { DEFAULT_TEXT_MODEL, TEXT_MODELS } from "./models";
import { defaultTextModel, draftPost, resolveTextModel } from "./nim";

const sqlMock = sql as unknown as Mock;

const completion = (content: string, prompt = 10, completionTokens = 20) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: prompt, completion_tokens: completionTokens },
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );

beforeEach(() => {
  vi.clearAllMocks();
  sqlMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("model resolution", () => {
  it("honors a valid NIM_MODEL override", () => {
    vi.stubEnv(
      "NIM_MODEL",
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
    );
    expect(defaultTextModel()).toBe(
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
    );
  });

  it("falls back to the default for invalid or blank overrides", () => {
    vi.stubEnv("NIM_MODEL", "not-a-model");
    expect(defaultTextModel()).toBe(DEFAULT_TEXT_MODEL);
    vi.stubEnv("NIM_MODEL", "   ");
    expect(defaultTextModel()).toBe(DEFAULT_TEXT_MODEL);
  });

  it("prefers a valid workspace model over the default", () => {
    vi.stubEnv("NIM_MODEL", "nvidia/nemotron-3.5-lightning-30b-a3b");
    expect(
      resolveTextModel("  nvidia/nemotron-3.5-bolt-e4b  ")
    ).toBe("nvidia/nemotron-3.5-bolt-e4b");
    expect(resolveTextModel("bogus")).toBe(
      "nvidia/nemotron-3.5-lightning-30b-a3b"
    );
    expect(resolveTextModel(null)).toBe(
      "nvidia/nemotron-3.5-lightning-30b-a3b"
    );
    expect(TEXT_MODELS.length).toBeGreaterThan(0);
  });
});

describe("draftPost", () => {
  it("returns the draft text, usage, and estimated cost", async () => {
    const fetchMock = vi.fn().mockResolvedValue(completion("Hello draft"));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NIM_BASE_URL", "https://nim.test/v1");
    vi.stubEnv("NIM_API_KEY", "key-123");
    sqlMock
      .mockImplementationOnce(async () => [])
      .mockImplementationOnce(async () => [{ total_tokens: 30 }]);

    await expect(draftPost("write something")).resolves.toEqual({
      text: "Hello draft",
      inputTokens: 10,
      outputTokens: 20,
      estimatedCost: 30 * 0.000001,
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://nim.test/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer key-123");
    expect(JSON.parse(init.body).model).toBe(DEFAULT_TEXT_MODEL);
  });

  it("uses the requested model when one is passed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(completion("ok"));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NIM_BASE_URL", "https://nim.test/v1");
    vi.stubEnv("NIM_API_KEY", "key-123");

    await draftPost("write something", "nvidia/nemotron-3.5-super-vl-120b-a12b");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe(
      "nvidia/nemotron-3.5-super-vl-120b-a12b"
    );
  });

  it("surfaces HTTP failures with the response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("boom", { status: 503 }))
    );
    await expect(draftPost("hi")).rejects.toThrow("NIM 503: boom");
  });

  it("rejects empty drafts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completion("   ")));
    await expect(draftPost("hi")).rejects.toThrow(
      "The model returned an empty draft. Try a different model."
    );
  });

  it("enforces the per-draft token cap before touching the database", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completion("big", 1500, 500)));
    await expect(draftPost("hi")).rejects.toThrow("per-draft cap exceeded");
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("enforces the daily token cap after recording usage", async () => {
    // Small per-draft usage (30 tokens) but a large accumulated daily total.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completion("ok")));
    sqlMock
      .mockImplementationOnce(async () => [])
      .mockImplementationOnce(async () => [{ total_tokens: 25_000 }]);

    await expect(draftPost("hi")).rejects.toThrow("daily cap exceeded");
    expect(
      sqlMock.mock.calls[0][0].join(" ").includes("INSERT INTO usage_daily")
    ).toBe(true);
  });

  it("distinguishes timeouts from other network failures", async () => {
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeout));
    await expect(draftPost("hi")).rejects.toThrow(
      "The AI model took too long to respond. Try a faster model."
    );

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    await expect(draftPost("hi")).rejects.toThrow(
      "Could not reach the NVIDIA model endpoint."
    );
  });
});
