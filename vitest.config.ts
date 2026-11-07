import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // Vitest's default spec-glob would swallow the Playwright suite (e2e/).
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "e2e/**",
      "test-results/**",
      "playwright-report/**",
    ],
  },
});
