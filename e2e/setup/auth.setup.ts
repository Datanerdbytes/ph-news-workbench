import { mkdirSync } from "node:fs";
import { test as setup, expect } from "@playwright/test";
import { requireEnv } from "../helpers/env";

const AUTH_DIR = "e2e/.auth";

setup("sign in as the seeded owner", async ({ request }) => {
  // Credentials come from .env.local (seed-owner.js account, pre-verified).
  const response = await request.post("/api/auth/sign-in/email", {
    data: {
      email: requireEnv("OWNER_EMAIL"),
      password: requireEnv("OWNER_PASSWORD"),
    },
  });
  expect(response.ok()).toBeTruthy();

  mkdirSync(AUTH_DIR, { recursive: true });
  await request.storageState({ path: `${AUTH_DIR}/owner.json` });
});
