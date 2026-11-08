import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createImageMediaContainer,
  fetchInstagramAccount,
  fetchMediaPermalink,
  getContainerStatus,
  InstagramApiError,
  publishMediaContainer,
} from "./instagram";

const fetchMock = vi.spyOn(globalThis, "fetch");

function respond(body: unknown, ok = true, status = 200) {
  fetchMock.mockResolvedValueOnce({
    ok,
    status,
    json: async () => body,
  } as unknown as Response);
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("fetchInstagramAccount", () => {
  it("maps the linked business account fields", async () => {
    respond({
      instagram_business_account: {
        id: "ig-77",
        username: "neuralverse.ph",
        profile_picture_url: "https://cdn/pic.jpg",
      },
    });
    const account = await fetchInstagramAccount("page-1", "tok");
    expect(account).toEqual({
      id: "ig-77",
      username: "neuralverse.ph",
      picture: "https://cdn/pic.jpg",
    });
    const url = fetchMock.mock.calls[0][0] as unknown as URL;
    expect(url.href).toContain("page-1");
    expect(url.searchParams.get("fields")).toBe(
      "instagram_business_account{id,username,profile_picture_url}"
    );
  });

  it("returns null when the Page has no linked account", async () => {
    respond({ instagram_business_account: null });
    expect(await fetchInstagramAccount("page-1", "tok")).toBeNull();
  });
});

describe("createImageMediaContainer", () => {
  it("returns the container id and posts the image URL", async () => {
    respond({ id: "container-1" });
    const id = await createImageMediaContainer({
      igUserId: "ig-77",
      imageToken: "tok",
      imageUrl: "https://blob/public/x.jpg",
      caption: "hi",
    });
    expect(id).toBe("container-1");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = new URLSearchParams(String(init.body));
    expect(body.get("image_url")).toBe("https://blob/public/x.jpg");
    expect(body.get("caption")).toBe("hi");
    expect(String((fetchMock.mock.calls[0][0] as URL).href)).toContain(
      "/ig-77/media"
    );
  });

  it("rejects a Graph response without a container id", async () => {
    respond({});
    await expect(
      createImageMediaContainer({
        igUserId: "ig-77",
        imageToken: "tok",
        imageUrl: "https://blob/public/x.jpg",
      })
    ).rejects.toThrow(InstagramApiError);
  });
});

describe("getContainerStatus", () => {
  it("normalizes snake_case status fields", async () => {
    respond({ status_code: "FINISHED", status_message: null });
    const status = await getContainerStatus("ig-77", "c-1", "tok");
    expect(status.statusCode).toBe("FINISHED");
    const url = fetchMock.mock.calls[0][0] as unknown as URL;
    expect(url.searchParams.get("fields")).toBe("status_code,status_message");
  });
});

describe("publishMediaContainer", () => {
  it("posts creation_id and returns the media id", async () => {
    respond({ id: "media-1" });
    const id = await publishMediaContainer({
      igUserId: "ig-77",
      accessToken: "tok",
      containerId: "c-1",
    });
    expect(id).toBe("media-1");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new URLSearchParams(String(init.body)).get("creation_id")).toBe(
      "c-1"
    );
  });
});

describe("fetchMediaPermalink", () => {
  it("returns null when Graph omits the permalink", async () => {
    respond({});
    expect(await fetchMediaPermalink("media-1", "tok")).toBeNull();
  });
});
