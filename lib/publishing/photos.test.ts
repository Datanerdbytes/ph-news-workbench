import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addPhotosToAlbum,
  createPageAlbum,
  listPageAlbums,
  publishPhotoPost,
} from "./photos";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function formOf(call: unknown[]): Record<string, string> {
  const form = (call[1] as { body: FormData }).body;
  const entries: Record<string, string> = {};
  for (const [key, value] of form.entries()) entries[key] = String(value);
  return entries;
}

const urlImage = (n: string) => ({ url: `https://cdn.example/${n}.jpg` });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("publishPhotoPost", () => {
  it("refuses to publish without images", async () => {
    await expect(
      publishPhotoPost({
        pageId: "pg1",
        accessToken: "tok",
        message: "x",
        images: [],
      })
    ).rejects.toThrow("Choose at least one image.");
  });

  it("publishes a single photo with its caption", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "photo1" }))
      .mockResolvedValueOnce(jsonResponse({ link: "https://fb.com/p/photo1" }));
    vi.stubGlobal("fetch", mock);

    await expect(
      publishPhotoPost({
        pageId: "pg1",
        accessToken: "tok",
        message: "Look at this",
        images: [urlImage("a")],
      })
    ).resolves.toEqual({
      id: "photo1",
      permalink: "https://fb.com/p/photo1",
      mediaIds: ["photo1"],
    });

    expect(new URL(String(mock.mock.calls[0][0])).pathname).toBe("/v23.0/pg1/photos");
    expect(formOf(mock.mock.calls[0])).toMatchObject({
      caption: "Look at this",
      published: "true",
      url: "https://cdn.example/a.jpg",
    });
  });

  it("schedules a single photo unpublished", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "photo1" }))
      .mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal("fetch", mock);

    await publishPhotoPost({
      pageId: "pg1",
      accessToken: "tok",
      message: "Later",
      images: [urlImage("a")],
      scheduledPublishTime: 1_800_000_000,
    });

    const form = formOf(mock.mock.calls[0]);
    expect(form.published).toBe("false");
    expect(form.scheduled_publish_time).toBe("1800000000");
  });

  it("uploads multiple photos unattached, then attaches them to a feed post", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "m1" }))
      .mockResolvedValueOnce(jsonResponse({ id: "m2" }))
      .mockResolvedValueOnce(jsonResponse({ id: "feed1" }))
      .mockResolvedValueOnce(jsonResponse({ permalink_url: "https://fb.com/f" }));
    vi.stubGlobal("fetch", mock);

    await expect(
      publishPhotoPost({
        pageId: "pg1",
        accessToken: "tok",
        message: "Two photos",
        images: [urlImage("a"), urlImage("b")],
      })
    ).resolves.toEqual({
      id: "feed1",
      permalink: "https://fb.com/f",
      mediaIds: ["m1", "m2"],
    });

    // The uploads are unpublished; only the feed post carries the message.
    expect(formOf(mock.mock.calls[0]).published).toBe("false");
    expect(formOf(mock.mock.calls[1]).published).toBe("false");
    expect(formOf(mock.mock.calls[2])).toMatchObject({
      message: "Two photos",
      "attached_media[0]": JSON.stringify({ media_fbid: "m1" }),
      "attached_media[1]": JSON.stringify({ media_fbid: "m2" }),
    });
  });

  it("uploads base64 images as multipart files", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "photo1" }))
      .mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal("fetch", mock);

    await publishPhotoPost({
      pageId: "pg1",
      accessToken: "tok",
      message: "x",
      images: [{ base64: "QUJD", type: "image/png", filename: "post.png" }],
    });

    const form = mock.mock.calls[0][1].body as FormData;
    const file = form.get("source") as File;
    expect(file.name).toBe("post.png");
    expect(file.type).toBe("image/png");
    expect(await file.text()).toBe("ABC"); // base64 QUJD
  });
});

describe("albums", () => {
  it("maps the page's albums with tolerant defaults", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: [
            {
              id: "al1",
              count: 12,
              created_time: "2026-01-01T00:00:00Z",
              link: "https://fb.com/al1",
            },
            { id: "al2", count: "not-a-number" },
          ],
        })
      )
    );

    await expect(listPageAlbums("pg1", "tok")).resolves.toEqual([
      {
        id: "al1",
        name: "Untitled album",
        count: 12,
        createdTime: "2026-01-01T00:00:00Z",
        link: "https://fb.com/al1",
      },
      { id: "al2", name: "Untitled album", count: null, createdTime: null, link: null },
    ]);
  });

  it("creates an album and reads its permalink, tolerating failures", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "al9" }))
      .mockResolvedValueOnce(jsonResponse({ link: "https://fb.com/al9" }));
    vi.stubGlobal("fetch", mock);

    await expect(
      createPageAlbum({
        pageId: "pg1",
        accessToken: "tok",
        name: "Flood response",
        description: "Photos",
      })
    ).resolves.toEqual({ id: "al9", permalink: "https://fb.com/al9" });
    expect(formOf(mock.mock.calls[0])).toMatchObject({
      name: "Flood response",
      message: "Photos",
    });

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ id: "al9" }))
        .mockResolvedValueOnce(jsonResponse({}, 500))
    );
    await expect(
      createPageAlbum({ pageId: "pg1", accessToken: "tok", name: "X" })
    ).resolves.toEqual({ id: "al9", permalink: null });
  });

  it("adds photos to an album, captioning only the first", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "a1" }))
      .mockResolvedValueOnce(jsonResponse({ id: "a2" }));
    vi.stubGlobal("fetch", mock);

    await expect(
      addPhotosToAlbum({
        pageId: "pg1",
        accessToken: "tok",
        albumId: "al1",
        message: "Album caption",
        images: [urlImage("a"), urlImage("b")],
      })
    ).resolves.toEqual({
      id: "al1",
      permalink: "https://www.facebook.com/media/set/?set=a.al1",
      mediaIds: ["a1", "a2"],
    });

    expect(formOf(mock.mock.calls[0]).message).toBe("Album caption");
    expect(formOf(mock.mock.calls[1]).message).toBeUndefined();
    expect(formOf(mock.mock.calls[0]).album_id).toBe("al1");
  });
});
