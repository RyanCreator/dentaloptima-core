import { test, expect } from "./fixtures-tp";

// MUTATING · isolated test practice. Edits a clinic setting, saves, and proves
// it persists across a full reload (round-trips through the DB), then restores
// the original value — self-cleaning, no service-role needed.
test("settings: clinic phone edit persists across reload", async ({ page }) => {
  await page.goto("/settings/clinic");

  const phone = page.getByTestId("settings-primary-phone");
  await expect(phone).toBeVisible();
  const original = await phone.inputValue();
  const testVal = `0190${Date.now().toString().slice(-7)}`;

  await phone.fill(testVal);
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForTimeout(1500);

  // Reload — the value survives only if it was actually persisted.
  await page.reload();
  await expect(page.getByTestId("settings-primary-phone")).toHaveValue(testVal);

  // Restore the original value.
  await page.getByTestId("settings-primary-phone").fill(original);
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.getByTestId("settings-primary-phone")).toHaveValue(original);
});
