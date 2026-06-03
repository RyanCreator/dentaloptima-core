import { test, expect } from "./fixtures-tp";
import { db, hasServiceRole } from "./db";

// MUTATING · isolated test practice. Books an appointment end-to-end through the
// New Appointment drawer (patient → service → staff → date → time), asserts the
// appointment row in the DB, then cleans up.
const PRACTICE = process.env.E2E_TP_PRACTICE_ID;
const PATIENT = process.env.E2E_TP_PATIENT_ID;

test.describe("booking (mutating · test practice)", () => {
  test.skip(
    !hasServiceRole || !PRACTICE || !PATIENT,
    "Needs service-role + seeded test practice (service + bookable staff)",
  );

  let apptIds: string[] = [];
  test.afterEach(async () => {
    if (db && apptIds.length) {
      await db.from("appointment_service").delete().in("appointment_id", apptIds);
      await db.from("appointment").delete().in("id", apptIds);
    }
    apptIds = [];
  });

  test("book an appointment", async ({ page }) => {
    await page.goto("/calendar");
    await page.getByRole("button", { name: /New Appointment/i }).first().click();

    // Patient (existing) — open the combobox, type, pick the seeded patient.
    await page.getByText(/Search patient by name/i).first().click();
    await page.waitForTimeout(400);
    await page.keyboard.type("E2E");
    await page.waitForTimeout(600);
    await page.getByRole("option", { name: /E2E Patient/i }).first().click();

    // Service.
    await page.getByText("Select service").click();
    await page.getByRole("option", { name: /E2E Checkup/i }).click();

    // Staff.
    await page.getByText("Select staff").click();
    await page.getByRole("option", { name: /E2E Owner/i }).click();

    // Date — open the picker and choose Jun 10 (a future weekday with cover;
    // "10" isn't in the visible week, so the locator is unambiguous).
    await page.getByText("Pick a date").click();
    await page.getByText("10", { exact: true }).click();
    await page.waitForTimeout(1500);

    // Time — clicking the Select also dismisses the date popover; pick the
    // first available slot.
    await page.getByText("Select time").click();
    await page.getByRole("option").first().click();

    await page.getByRole("button", { name: "Create Appointment" }).click();

    // Persisted as a scheduled appointment for the seeded patient.
    await expect.poll(async () => {
      const { data } = await db!
        .from("appointment")
        .select("id")
        .eq("practice_id", PRACTICE!)
        .eq("patient_id", PATIENT!);
      apptIds = (data ?? []).map((r) => r.id as string);
      return apptIds.length;
    }, { timeout: 15_000 }).toBeGreaterThan(0);
  });
});
