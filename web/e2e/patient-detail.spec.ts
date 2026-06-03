import { test, expect } from "./fixtures";

// Patient detail renders and every tab loads without errors (non-mutating).
test("patient detail: all tabs render without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/patients");
  // Wait for the practice-scoped list to render, then open the first patient.
  const firstPatient = page.locator("text=/Optima\\d+/").first();
  const appeared = await firstPatient
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(!appeared, "No patients on this tenant");
  await firstPatient.click();

  await expect(page.getByRole("heading", { name: /Patient Details/i })).toBeVisible();

  for (const tab of ["Overview", "Clinical", "Documents", "Financial", "Profile"]) {
    await page.getByText(tab, { exact: true }).click();
    await page.waitForTimeout(700);
    await expect(page.getByText(/something went wrong|unexpected error/i)).toHaveCount(0);
  }

  // Clinical sections are the richest — confirm they render.
  await page.getByText("Clinical", { exact: true }).click();
  await expect(page.getByText(/Medical alerts/i)).toBeVisible();
  await expect(page.getByText(/Consent records/i)).toBeVisible();
  await expect(page.getByText(/Treatment Plans/i)).toBeVisible();

  expect(errors, errors.join("\n")).toEqual([]);
});
