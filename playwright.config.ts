import { defineConfig } from "@playwright/test";

// Sign-in only works from the origin pinned in .env.local (BETTER_AUTH_URL /
// BETTER_AUTH_TRUSTED_ORIGINS → :3001), so the suite must run there. When the
// developer's dev server is already up it is reused; otherwise one is booted.
const PORT = 3001;
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
