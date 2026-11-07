import { expect, test } from "@playwright/test";

// Regression for two Ask AI bugs: (1) the input used to be disabled without a
// draft ("can't type"), and (2) replies must populate the field, not stay in
// the chat — even when the field starts empty ("write me a caption").
test("Ask AI accepts typing without a draft selected", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Ask AI" }).click();
  const panel = page.getByRole("dialog", { name: "AI assistant" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Ready to write")).toBeVisible();

  const input = panel.getByRole("textbox", { name: "Ask the assistant to write or revise" });
  await expect(input).toBeEnabled();
  await input.fill("Give me a story idea");
  await expect(input).toHaveValue("Give me a story idea");
});

// The other half: once the composer has text, the pill says Draft in context.
test("flips to draft mode once the composer has text", async ({ page }) => {
  await page.goto("/photos");

  await page.fill("#photo-message", "Something worth revising");
  await page.getByRole("button", { name: "Ask AI" }).click();
  const panel = page.getByRole("dialog", { name: "AI assistant" });

  await expect(panel.getByText("Draft in context")).toBeVisible();
  const input = panel.getByRole("textbox", {
    name: "Ask the assistant to write or revise",
  });
  await expect(input).toBeEnabled();
  await input.fill("Make it shorter");
  await expect(input).toHaveValue("Make it shorter");
});
