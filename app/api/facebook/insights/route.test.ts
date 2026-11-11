import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/publishing/connection", () => ({
  resolvePageTargets: vi.fn(),
}));
vi.mock("@/lib/facebook", () => ({
  fetchPageAudience: vi.fn(),
  fetchPageActivity: vi.fn(),
  redactTokens: vi.fn((value: string) => value),
}));
vi.mock("@/lib/session", () => ({
  requireWorkspace: vi.fn(),
  unauthorized: () =>
    new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
}));

import {
  fetchPageActivity,
  fetchPageAudience,
  redactTokens,
} from "@/lib/facebook";
import { resolvePageTargets } from "@/lib/publishing/connection";
import { requireWorkspace } from "@/lib/session";
import { GET } from "./route";

const resolvePageTargetsMock = resolvePageTargets as unknown as Mock;
const fetchPageAudienceMock = fetchPageAudience as unknown as Mock;
const fetchPageActivityMock = fetchPageActivity as unknown as Mock;
const redactTokensMock = redactTokens as unknown as Mock;
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

describe("GET /api/facebook/insights", () => {
  it("reports a disconnected workspace when no page is selected", async () => {
    resolvePageTargetsMock.mockResolvedValue([]);
    const response = await GET(new Request("http://localhost/api/facebook/insights"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ connected: false });
  });

  it("returns live audience and activity for the selected page", async () => {
    resolvePageTargetsMock.mockResolvedValue([target]);
    fetchPageAudienceMock.mockResolvedValue({
      pageName: "NeuralVerse",
      fans: 141,
      followers: 138,
    });
    fetchPageActivityMock.mockResolvedValue({
      engagements7d: 12,
      mediaViews7d: 340,
    });

    const response = await GET(new Request("http://localhost/api/facebook/insights"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      connected: true,
      available: true,
      pageName: "NeuralVerse",
      fans: 141,
      followers: 138,
      engagements7d: 12,
      mediaViews7d: 340,
    });
    expect(fetchPageAudienceMock).toHaveBeenCalledWith("1588780184320833", "page-token");
    expect(fetchPageActivityMock).toHaveBeenCalledWith("1588780184320833", "page-token");
  });

  it("degrades to available:false with the page name when Graph fails", async () => {
    resolvePageTargetsMock.mockResolvedValue([target]);
    fetchPageAudienceMock.mockRejectedValue(new Error("(#190) token exploded"));

    const response = await GET(new Request("http://localhost/api/facebook/insights"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      connected: true,
      available: false,
      pageName: "NeuralVerse",
      reason: "(#190) token exploded",
    });
  });
});
