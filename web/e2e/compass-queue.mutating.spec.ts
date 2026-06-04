import { test, expect } from "./fixtures-tp";
import { db, hasServiceRole } from "./db";

// MUTATING · isolated test practice. Drives the ready-to-submit *queue*: the
// header "Submit N in Compass" button opens the guided helper, and recording one
// claim advances to the next until the queue closes. Verifies both seeded
// fixtures end up SUBMITTED. Both claims are reset to READY each run.
const PRACTICE = process.env.E2E_TP_PRACTICE_ID;
const FIXTURES = ["E2E-FIXTURE", "E2E-FIXTURE-2"];

test.describe("Compass submission queue (mutating · test practice)", () => {
  test.skip(
    !hasServiceRole || !PRACTICE,
    "Needs service-role + the seeded test practice (E2E_TP_PRACTICE_ID; run the seed)",
  );

  async function reset() {
    if (db) {
      await db.from("nhs_claim")
        .update({ status: "READY_TO_SUBMIT", submission_reference: null, submitted_at: null })
        .eq("practice_id", PRACTICE!)
        .in("course_of_treatment_id", FIXTURES);
    }
  }
  test.beforeEach(reset);
  test.afterEach(reset);

  test("queue walks every ready claim and records each as submitted", async ({ page }) => {
    await page.goto("/claims");

    // The header button is labelled with the live ready count.
    const open = page.getByRole("button", { name: /Submit \d+ in Compass/ });
    await expect(open).toBeVisible();
    const label = await open.innerText();
    const n = Number(label.match(/\d+/)?.[0] ?? 0);
    expect(n).toBeGreaterThanOrEqual(2); // both fixtures are ready
    await open.click();

    // Walk the queue: each step shows "i of n", attest, then advance.
    for (let i = 0; i < n; i++) {
      await expect(page.getByText(`${i + 1} of ${n}`)).toBeVisible();
      const submit = page.getByRole("button", { name: "Mark as submitted" });
      await expect(submit).toBeVisible();
      await page.getByText(/I have finalised/).click();
      await expect(submit).toBeEnabled();
      await submit.click();
    }

    // Queue finished → helper closed.
    await expect(page.getByRole("button", { name: "Mark as submitted" })).toHaveCount(0);

    // Both fixtures recorded as submitted.
    await expect.poll(async () => {
      const { data } = await db!.from("nhs_claim")
        .select("status")
        .eq("practice_id", PRACTICE!)
        .in("course_of_treatment_id", FIXTURES);
      return (data ?? []).map((r) => r.status).sort();
    }, { timeout: 15_000 }).toEqual(["SUBMITTED", "SUBMITTED"]);
  });
});
