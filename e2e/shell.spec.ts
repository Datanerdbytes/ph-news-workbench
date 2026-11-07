import { expect, test } from "@playwright/test";

test("renders the dashboard activity feed", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Activity log" })
  ).toBeVisible();
  await expect(page.getByText("Loading your workspace…")).toBeHidden();
});

test("renders the calendar with its scheduled sidebar", async ({ page }) => {
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "Calendar", exact: true }))
    .toBeVisible();
  await expect(page.getByRole("heading", { name: "Scheduled" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Today" })).toBeVisible();
});

test("signs out from the account menu back to /login", async ({ page }) => {
  await page.goto("/dashboard");

  // The account trigger lives in the sidebar; other aria-haspopup="menu"
  // buttons (bell, publish nav) are elsewhere in the frame.
  await page.locator("aside button[aria-haspopup='menu']").click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();

  await expect(page).toHaveURL(/\/login/);
});
