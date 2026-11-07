import { expect, test } from "@playwright/test";

// Regression for the "can't type to Ask AI" bug: with no draft text the
// assistant used to strand the panel at "No draft yet" with a disabled input.
// It must fall back to general chat with an always-enabled input.
test("Ask AI accepts typing without a draft selected", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Ask AI" }).click();
  const panel = page.getByRole("dialog", { name: "AI assistant" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("General chat")).toBeVisible();

  const input = panel.getByRole("textbox", { name: "Message the assistant" });
  await expect(input).toBeEnabled();
  await input.fill("Give me a story idea");
  await expect(input).toHaveValue("Give me a story idea");
});

// The other half of the fix: once the composer has text, the panel flips to
// draft mode and offers to revise it in place.
test("flips to draft mode once the composer has text", async ({ page }) => {
  await page.goto("/photos");

  await page.fill("#photo-message", "Something worth revising");
  await page.getByRole("button", { name: "Ask AI" }).click();
  const panel = page.getByRole("dialog", { name: "AI assistant" });

  await expect(panel.getByText("Draft in context")).toBeVisible();
  const input = panel.getByRole("textbox", {
    name: "Ask the assistant to revise the draft",
  });
  await expect(input).toBeEnabled();
  await input.fill("Make it shorter");
  await expect(input).toHaveValue("Make it shorter");
});
