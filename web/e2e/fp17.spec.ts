import { test, expect } from "./fixtures";

// FP17 / NHS claims. Non-mutating: asserts the claims dashboard + detail render
// (the activity-line model) and the live pre-submission validation UX, without
// persisting a claim. The write path is covered by the validator unit tests and
// manual DB-verified runs.

test.describe("NHS claims", () => {
  test("claims dashboard renders", async ({ page }) => {
    await page.goto("/claims");
    await expect(page.getByText("NHS Claims").first()).toBeVisible();
    await expect(page.getByPlaceholder(/Search patient/i)).toBeVisible();
  });

  test("claim detail shows 9000-code activity lines", async ({ page }) => {
    await page.goto("/claims");
    // Claim rows carry "Performer …" — wait for the list, then open the first.
    const firstClaim = page.locator("text=/Performer\\s/").first();
    const hasClaims = await firstClaim
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!hasClaims, "No claims on this tenant");
    await firstClaim.click();
    await expect(page.getByText(/Activity codes/i)).toBeVisible();
  });

  test("validation gates submission of an incomplete FP17", async ({ page }) => {
    await page.goto("/calendar");
    await page.waitForTimeout(1500);
    // Step back a week to reach historical completed appointments.
    await page.mouse.click(900, 600);
    await page.keyboard.press("ArrowLeft");

    // Open a known completed NHS appointment (tenant demo data).
    const chip = page.locator("text=Dental10").first();
    const hasChip = await chip
      .waitFor({ state: "visible", timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!hasChip, "No completed NHS appointment in this week");
    await chip.click();
    await page.waitForTimeout(1000);

    const createBtn = page.getByRole("button", { name: /Create FP17 claim|^FP17 claim$/ });
    test.skip((await createBtn.count()) === 0, "Appointment is not a completed NHS visit");
    await createBtn.first().click();

    // The claim sheet renders with the live validation panel, and the gate
    // blocks submission while the claim is invalid (the core safety invariant).
    await expect(page.getByText(/Treatments performed/i)).toBeVisible();
    await expect(page.getByText(/NHS data set/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark ready to submit" })).toBeDisabled();
    // Always allowed to save a draft.
    await expect(page.getByRole("button", { name: "Save draft" })).toBeEnabled();
    // Close WITHOUT saving — this spec must not persist a claim.
    await page.keyboard.press("Escape");
  });
});
