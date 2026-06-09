import { test, expect } from "./fixtures-tp";
import { db, hasServiceRole } from "./db";

// MUTATING · isolated test practice. Marks the seeded patient inactive from the
// patient page (reason + recall cancellation), asserts persistence, then the
// afterEach resets the patient to REGISTERED and the recall to PENDING.
const PATIENT = process.env.E2E_TP_PATIENT_ID;
const RECALL = process.env.E2E_TP_RECALL_ID;

test.describe("Inactive patient flagging (mutating · test practice)", () => {
  test.skip(!hasServiceRole || !PATIENT, "Needs service-role + seeded test practice");

  async function reset() {
    if (!db) return;
    await db.from("patient")
      .update({ registration_status: "REGISTERED", status_reason: null, status_note: null })
      .eq("id", PATIENT!);
    if (RECALL) {
      await db.from("recall")
        .update({ status: "PENDING", cancelled_at: null, cancellation_reason: null })
        .eq("id", RECALL!);
    }
  }
  test.beforeEach(reset);
  test.afterEach(reset);

  test("mark inactive sets status + reason and cancels open recalls", async ({ page }) => {
    await page.goto(`/patients/${PATIENT}`);

    await page.getByRole("button", { name: "Status" }).first().click();
    await page.getByRole("menuitem", { name: /Mark inactive/ }).click();

    // Dialog: pick a reason then confirm.
    await expect(page.getByText("Mark patient inactive")).toBeVisible();
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "Switched to another practice" }).click();
    await page.getByRole("button", { name: "Mark inactive", exact: true }).click();

    // Persisted: patient INACTIVE with the reason, recall cancelled.
    await expect.poll(async () => {
      const { data } = await db!.from("patient")
        .select("registration_status, status_reason").eq("id", PATIENT!).maybeSingle();
      return data;
    }, { timeout: 15_000 }).toMatchObject({
      registration_status: "INACTIVE",
      status_reason: "SWITCHED_PRACTICE",
    });

    if (RECALL) {
      await expect.poll(async () => {
        const { data } = await db!.from("recall").select("status").eq("id", RECALL!).maybeSingle();
        return data?.status;
      }, { timeout: 15_000 }).toBe("CANCELLED");
    }
  });
});
