import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchDownloadedVideo, parseVideoParam } from "./import-download";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseVideoParam", () => {
  it("reads the job id from the query string", () => {
    expect(parseVideoParam("?video=abc-123")).toBe("abc-123");
    expect(parseVideoParam("video=abc-123&other=1")).toBe("abc-123");
  });

  it("returns null when there is no job id", () => {
    expect(parseVideoParam("")).toBeNull();
    expect(parseVideoParam("?other=1")).toBeNull();
    expect(parseVideoParam("?video=")).toBeNull();
  });
});

describe("fetchDownloadedVideo", () => {
  function stubFetch(
    meta: { status: number; body: unknown },
    file: { status: number; body: Blob }
  ) {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/file")) {
        return {
          ok: file.status >= 200 && file.status < 300,
          status: file.status,
          blob: async () => file.body,
        };
      }
      return {
        ok: meta.status >= 200 && meta.status < 300,
        status: meta.status,
        json: async () => meta.body,
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("returns the downloaded video as a File named after the stored file", async () => {
    stubFetch(
      { status: 200, body: { job: { fileName: "clip (H.264).mp4", platform: "Facebook" } } },
      { status: 200, body: new Blob(["video-bytes"], { type: "video/mp4" }) }
    );

    const result = await fetchDownloadedVideo("job-1");

    expect(result.file.name).toBe("clip (H.264).mp4");
    expect(result.file.type).toBe("video/mp4");
    expect(result.platform).toBe("Facebook");
    expect(await result.file.text()).toBe("video-bytes");
  });

  it("falls back to the job id when the record has no file name", async () => {
    stubFetch(
      { status: 200, body: { job: { fileName: null, platform: "YouTube" } } },
      { status: 200, body: new Blob(["bytes"], { type: "video/mp4" }) }
    );

    const result = await fetchDownloadedVideo("job-2");
    expect(result.file.name).toBe("job-2.mp4");
  });

  it("surfaces the API error when the job is missing", async () => {
    stubFetch(
      { status: 404, body: { error: "Download job not found." } },
      { status: 404, body: new Blob([]) }
    );

    await expect(fetchDownloadedVideo("job-3")).rejects.toThrow(
      "Download job not found."
    );
  });

  it("fails when the file is not ready", async () => {
    stubFetch(
      { status: 200, body: { job: { fileName: "clip.mp4", platform: "Facebook" } } },
      { status: 409, body: new Blob([]) }
    );

    await expect(fetchDownloadedVideo("job-4")).rejects.toThrow(
      "not ready yet"
    );
  });
});
