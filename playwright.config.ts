import { defineConfig } from "@playwright/test";
import { envLocal } from "./e2e/helpers/env";

// Sign-in only works from the origin auth trusts, so run on the port pinned by
// BETTER_AUTH_URL in .env.local instead of a hardcoded copy that can drift from
// the dev server (the source of INVALID_ORIGIN sign-in failures). When the
// developer's dev server is already up it is reused; otherwise one is booted.
const authURL = new URL(envLocal().BETTER_AUTH_URL || "http://localhost:3000");
const PORT = Number(authURL.port) || 3000;
const baseURL = `http://localhost:${PORT}`;
const authFile = "e2e/.auth/owner.json";

export default defineConfig({
  testDir: "./e2e",
  // Regression suite: deterministic order beats speed. One worker keeps the
  // sign-out spec from killing the shared session mid-run for the others.
  fullyParallel: false,
  workers: 1,
  // Generous enough to absorb Turbopack cold-compile latency when the suite
  // runs against a freshly wiped .next (first hit of a page compiles it).
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    baseURL,
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: "setup",
      testMatch: /setup\/.*\.ts/,
    },
    {
      name: "public",
      testMatch: /auth\.spec\.ts/,
    },
    {
      name: "authenticated",
      testIgnore: /auth\.spec\.ts|setup\//,
      dependencies: ["setup"],
      use: { storageState: authFile },
    },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
