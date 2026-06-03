import { test, expect } from "./fixtures-tp";
import { db, hasServiceRole } from "./db";

// MUTATING spec — runs only when E2E_ALLOW_MUTATIONS is set, against the
// ISOLATED test practice (never demo/production data). Pattern: perform the
// action through the UI, assert it in the UI AND in the DB, then clean up via
// the service-role client in afterEach.
const PATIENT = process.env.E2E_TP_PATIENT_ID;

test.describe("patient notes (mutating · test practice)", () => {
  test.skip(
    !hasServiceRole || !PATIENT,
    "Needs SUPABASE_SERVICE_ROLE_KEY + E2E_TP_PATIENT_ID (run the seed first)",
  );

  let createdIds: string[] = [];

  test.afterEach(async () => {
    if (db && createdIds.length) {
      await db.from("note").delete().in("id", createdIds);
    }
    createdIds = [];
  });

  test("add a note → shows in UI → persisted in DB", async ({ page }) => {
    const body = `E2E note ${Date.now()}`;

    await page.goto(`/patients/${PATIENT}`);
    await page.getByTestId("patient-note-input").fill(body);
    await page.getByTestId("patient-note-submit").click();

    // Appears in the UI.
    await expect(
      page.getByTestId("patient-note").filter({ hasText: body }),
    ).toBeVisible();

    // Genuinely persisted (not just rendered optimistically).
    const { data, error } = await db!
      .from("note")
      .select("id")
      .eq("patient_id", PATIENT!)
      .eq("body", body);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
    createdIds = (data ?? []).map((r) => r.id as string);
  });
});
