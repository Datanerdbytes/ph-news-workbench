import { expect, test } from "@playwright/test";

test("shows the Facebook post preview on the Photo posts tab", async ({
  page,
}) => {
  await page.goto("/photos");

  await expect(page.getByText("Facebook preview", { exact: true }))
    .toBeVisible();
  await expect(page.getByText("Your draft will appear here.")).toBeVisible();
});

test("swaps to the album preview on the Albums tab", async ({ page }) => {
  await page.goto("/photos");

  await page.getByRole("button", { name: "Albums" }).click();

  await expect(page.getByText("Facebook album preview")).toBeVisible();
  await expect(page.getByText("Photos you add will appear here.")).toBeVisible();
  // The create-album card was removed — Meta killed the Graph API endpoint.
  // exact:true — the aside note "create albums on Facebook directly" contains
  // this string case-insensitively.
  await expect(page.getByText("Create album", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/create albums on\s+Facebook directly/i))
    .toBeVisible();
});

test("warns about oversized images up front", async ({ page }) => {
  await page.goto("/photos");
  await expect(page.getByText(/under 10 MB/).first()).toBeVisible();
});
