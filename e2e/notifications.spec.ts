import { expect, test } from "@playwright/test";
import { clearSeededNotifications, seedNotifications } from "./helpers/db";

test.beforeEach(async () => {
  await seedNotifications(2);
});

test.afterEach(async () => {
  await clearSeededNotifications();
});

test("shows the unread badge, lists rows, and marks all read", async ({
  page,
}) => {
  await page.goto("/dashboard");

  const bell = page.getByRole("button", { name: "Notifications, 2 unread" });
  await expect(bell).toBeVisible();
  await bell.click();

  await expect(page.getByText("Regression seed 1")).toBeVisible();
  await expect(page.getByText("Regression seed 2")).toBeVisible();

  await page.getByRole("menuitem", { name: "Mark all read" }).click();
  await expect(
    page.getByRole("button", { name: "Notifications", exact: true })
  ).toBeVisible();
});

test("marks a row read and follows its link", async ({ page }) => {
  await page.goto("/dashboard");

  await page
    .getByRole("button", { name: "Notifications, 2 unread" })
    .click();
  await page.getByRole("menuitem", { name: /Regression seed 1/ }).click();

  await expect(page).toHaveURL(/\/calendar/);
});
