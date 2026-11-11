import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/publishing/connection", () => ({
  resolvePageTargets: vi.fn(),
}));
vi.mock("@/lib/facebook", () => ({
  fetchPageAudience: vi.fn(),
  fetchPageActivity: vi.fn(),
  fetchPageTopPosts: vi.fn(),
  fetchInstagramOverview: vi.fn(),
  redactTokens: vi.fn((value: string) => value),
}));
vi.mock("@/lib/session", () => ({
  requireWorkspace: vi.fn(),
  unauthorized: () =>
    new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
}));

import {
  fetchInstagramOverview,
  fetchPageActivity,
  fetchPageAudience,
  fetchPageTopPosts,
} from "@/lib/facebook";
import { resolvePageTargets } from "@/lib/publishing/connection";
import { requireWorkspace } from "@/lib/session";
import { GET } from "./route";

const resolvePageTargetsMock = resolvePageTargets as unknown as Mock;
const fetchPageAudienceMock = fetchPageAudience as unknown as Mock;
const fetchPageActivityMock = fetchPageActivity as unknown as Mock;
const fetchPageTopPostsMock = fetchPageTopPosts as unknown as Mock;
const fetchInstagramOverviewMock = fetchInstagramOverview as unknown as Mock;
const requireWorkspaceMock = requireWorkspace as unknown as Mock;

const target = {
  id: "1588780184320833",
  name: "NeuralVerse",
  accessToken: "page-token",
};

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkspaceMock.mockResolvedValue({
    user: { id: "u1" },
    workspace: { id: "ws_1", role: "owner" },
  });
});

function callRoute() {
  return GET(new Request("http://localhost/api/facebook/insights"));
}

describe("GET /api/facebook/insights", () => {
  it("reports a disconnected workspace when no page is selected", async () => {
    resolvePageTargetsMock.mockResolvedValue([]);
    const response = await callRoute();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ connected: false });
  });

  it("returns audience, activity, posts and instagram for the selected page", async () => {
    resolvePageTargetsMock.mockResolvedValue([target]);
    fetchPageAudienceMock.mockResolvedValue({
      pageName: "The Daily Buzz",
      fans: 141,
      followers: 141,
    });
    fetchPageActivityMock.mockResolvedValue({
      engagements7d: 12,
      mediaViews7d: 340,
    });
    fetchPageTopPostsMock.mockResolvedValue([
      {
        id: "p1",
        message: "Hello",
        permalinkUrl: "https://facebook.com/p1",
        createdAt: "2026-11-10T04:17:11+0000",
        shares: 2,
        reactions: 7,
        comments: 1,
      },
    ]);
    fetchInstagramOverviewMock.mockResolvedValue({
      username: "neuralverse",
      followers: 95,
      mediaCount: 73,
      recent: [],
    });

    const response = await callRoute();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      connected: true,
      available: true,
      pageName: "The Daily Buzz",
      fans: 141,
      followers: 141,
      engagements7d: 12,
      mediaViews7d: 340,
      topPostsError: null,
      instagramError: null,
    });
    expect(body.topPosts).toHaveLength(1);
    expect(body.instagram).toMatchObject({ username: "neuralverse", followers: 95 });
    expect(fetchPageTopPostsMock).toHaveBeenCalledWith("1588780184320833", "page-token");
    expect(fetchInstagramOverviewMock).toHaveBeenCalledWith("1588780184320833", "page-token");
  });

  it("keeps the audience card alive when only the posts edge fails", async () => {
    resolvePageTargetsMock.mockResolvedValue([target]);
    fetchPageAudienceMock.mockResolvedValue({
      pageName: "The Daily Buzz",
      fans: 141,
      followers: 141,
    });
    fetchPageActivityMock.mockResolvedValue({
      engagements7d: 0,
      mediaViews7d: 0,
    });
    fetchPageTopPostsMock.mockRejectedValue(new Error("(#10) needs permission"));
    fetchInstagramOverviewMock.mockResolvedValue(null);

    const response = await callRoute();
    const body = await response.json();
    expect(body.available).toBe(true);
    expect(body.fans).toBe(141);
    expect(body.topPosts).toBeNull();
    expect(body.topPostsError).toBe("(#10) needs permission");
    expect(body.instagram).toBeNull();
    expect(body.instagramError).toBeNull();
  });

  it("degrades to available:false with the page name when audience fails", async () => {
    resolvePageTargetsMock.mockResolvedValue([target]);
    fetchPageAudienceMock.mockRejectedValue(new Error("(#190) token exploded"));

    const response = await callRoute();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      connected: true,
      available: false,
      pageName: "NeuralVerse",
      reason: "(#190) token exploded",
    });
  });
});
