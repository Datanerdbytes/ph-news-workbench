import { afterEach, describe, expect, it, vi } from "vitest";
import { localRuntimeEnabled } from "./media";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("localRuntimeEnabled", () => {
  it("allows local processing in dev runs", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(localRuntimeEnabled()).toBe(true);
  });

  it("requires an explicit opt-in outside development", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(localRuntimeEnabled()).toBe(false);

    vi.stubEnv("ENABLE_LOCAL_VIDEO_PROCESSING", "1");
    expect(localRuntimeEnabled()).toBe(true);
  });

  it("also honors the legacy HyperFrames opt-in", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("HYPERFRAMES_ENABLE_RENDER", "1");
    expect(localRuntimeEnabled()).toBe(true);
  });
});
