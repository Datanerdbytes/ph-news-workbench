import { expect, test } from "@playwright/test";
import { clearSignInLock } from "./helpers/db";

test.describe("auth gate", () => {
  test("redirects unauthenticated visits to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });
});

test.describe("sign-in form", () => {
  // better-auth tallies every unauthorized attempt in sign_in_locks, even for
  // emails that do not exist — clean the row so the table stays untouched.
  const badEmail = `regression.badcreds.${Date.now()}@example.com`;

  test.afterAll(async () => {
    await clearSignInLock(badEmail);
  });

  test("surfaces the server error for bad credentials", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", badEmail);
    await page.fill("#password", "wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    // Text, not getByRole("alert") — Next's route announcer also has that role.
    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
  });
});

test.describe("lockout regression", () => {
  // Throwaway address: the tally is keyed by email, so the real owner account
  // is never touched and the row is deleted in afterAll.
  const lockEmail = `regression.lock.${Date.now()}@example.com`;

  test.afterAll(async () => {
    await clearSignInLock(lockEmail);
  });

  test("locks the account after five failed attempts", async ({ page }) => {
    await page.goto("/login");

    for (let attempt = 0; attempt < 5; attempt++) {
      await page.fill("#email", lockEmail);
      // The form enforces minLength=8 — shorter passwords never submit.
      await page.fill("#password", `wrong-password-${attempt}`);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.getByText(/invalid email or password/i)).toBeVisible();
    }

    // The sixth attempt is refused by the lock before the password check.
    await page.fill("#email", lockEmail);
    await page.fill("#password", "still-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/too many failed sign-in attempts/i))
      .toBeVisible();
  });
});
