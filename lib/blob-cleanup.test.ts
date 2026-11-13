import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteStagedBlob } from "./blob-cleanup";

const fetchMock = vi.fn();

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("deleteStagedBlob", () => {
  it("sends a DELETE with the blob url", () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    deleteStagedBlob("https://blob.example/staged.mp4");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [input, init] = fetchMock.mock.calls[0];
    expect(input).toBe("/api/blob");
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body)).toEqual({
      url: "https://blob.example/staged.mp4",
    });
  });

  it("swallows network failures — cleanup is best-effort", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(() => deleteStagedBlob("https://blob.example/x.png")).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
