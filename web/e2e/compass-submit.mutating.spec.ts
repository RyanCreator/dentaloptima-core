import { test, expect } from "./fixtures-tp";
import { db, hasServiceRole } from "./db";

// MUTATING · isolated test practice. Drives the Compass submission helper on a
// READY_TO_SUBMIT claim: copy-fields render, the attestation gates the submit,
// and "Mark as submitted" records SUBMITTED + the reference. Reset each run.
const CLAIM = process.env.E2E_TP_CLAIM_ID;

test.describe("Compass submission helper (mutating · test practice)", () => {
  test.skip(
    !hasServiceRole || !CLAIM,
    "Needs service-role + a seeded READY claim (E2E_TP_CLAIM_ID; run the seed)",
  );

  async function reset() {
    if (db) {
      await db.from("nhs_claim")
        .update({ status: "READY_TO_SUBMIT", submission_reference: null, submitted_at: null })
        .eq("id", CLAIM!);
    }
  }
  test.beforeEach(reset);
  test.afterEach(reset);

  test("attestation gates submit; marking records SUBMITTED + reference", async ({ page }) => {
    await page.goto(`/claims?claim=${CLAIM}`);
    await page.getByRole("button", { name: "Submit to Compass" }).click();

    // Helper renders the ordered copy fields.
    await expect(page.getByText("Course of treatment")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Copy / }).first()).toBeVisible();

    // Gate: submit is disabled until the user attests.
    const submit = page.getByRole("button", { name: "Mark as submitted" });
    await expect(submit).toBeDisabled();

    await page.getByText(/I have finalised/).click();
    const ref = `E2E-REF-${Date.now().toString().slice(-6)}`;
    await page.getByPlaceholder(/If Compass shows one/).fill(ref);
    await expect(submit).toBeEnabled();
    await submit.click();

    // Recorded as submitted with the reference stored for reconciliation.
    await expect.poll(async () => {
      const { data } = await db!.from("nhs_claim").select("status, submission_reference").eq("id", CLAIM!);
      return data?.[0];
    }, { timeout: 15_000 }).toMatchObject({ status: "SUBMITTED", submission_reference: ref });
  });
});
