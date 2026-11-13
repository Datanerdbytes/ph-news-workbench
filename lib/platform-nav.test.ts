import { describe, expect, it } from "vitest";
import {
  facebookToolsVisible,
  platformSectionFromPath,
} from "./platform-nav";

describe("facebookToolsVisible", () => {
  it("keeps Facebook tools on Facebook and shared workspace routes", () => {
    const routes = [
      "/",
      "/post",
      "/photos",
      "/videos",
      "/reels",
      "/live",
      "/stories",
      "/dashboard",
      "/status",
      "/calendar",
      "/downloads",
      "/analytics",
      "/accounts",
      "/sources",
      "/team",
      "/settings",
    ];
    for (const pathname of routes) {
      expect(facebookToolsVisible(pathname), pathname).toBe(true);
    }
  });

  it("hides Facebook tools on the Platforms hub and inside other platform studios", () => {
    const routes = [
      "/platforms",
      "/platforms/anything",
      "/instagram",
      "/tiktok",
      "/youtube",
      "/instagram/anything",
      "/tiktok/anything",
      "/youtube/anything",
    ];
    for (const pathname of routes) {
      expect(facebookToolsVisible(pathname), pathname).toBe(false);
    }
  });

  it("does not treat lookalike paths as studios", () => {
    expect(facebookToolsVisible("/instagramish")).toBe(true);
    expect(facebookToolsVisible("/youtube-2")).toBe(true);
  });
});

describe("platformSectionFromPath", () => {
  it("maps studio routes and their subpaths to their platform", () => {
    expect(platformSectionFromPath("/youtube")).toBe("youtube");
    expect(platformSectionFromPath("/youtube/anything")).toBe("youtube");
    expect(platformSectionFromPath("/instagram")).toBe("instagram");
    expect(platformSectionFromPath("/instagram/anything")).toBe("instagram");
    expect(platformSectionFromPath("/tiktok")).toBe("tiktok");
    expect(platformSectionFromPath("/tiktok/anything")).toBe("tiktok");
  });

  it("returns null for Facebook, shared, and hub routes", () => {
    const routes = [
      "/",
      "/post",
      "/photos",
      "/videos",
      "/reels",
      "/live",
      "/stories",
      "/dashboard",
      "/status",
      "/calendar",
      "/downloads",
      "/analytics",
      "/accounts",
      "/platforms",
      "/platforms/anything",
      "/sources",
      "/team",
      "/settings",
    ];
    for (const pathname of routes) {
      expect(platformSectionFromPath(pathname), pathname).toBeNull();
    }
  });

  it("does not treat lookalike paths as studios", () => {
    expect(platformSectionFromPath("/instagramish")).toBeNull();
    expect(platformSectionFromPath("/youtube-2")).toBeNull();
    expect(platformSectionFromPath("/tiktokker")).toBeNull();
  });
});