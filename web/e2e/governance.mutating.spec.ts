import { test, expect } from "./fixtures-tp";
import { db, hasServiceRole } from "./db";

// MUTATING · isolated test practice. Logs an incident through the Governance UI,
// asserts it in the UI and the DB, then deletes it via service-role in afterEach.
const PRACTICE = process.env.E2E_TP_PRACTICE_ID;

test.describe("governance incidents (mutating · test practice)", () => {
  test.skip(
    !hasServiceRole || !PRACTICE,
    "Needs SUPABASE_SERVICE_ROLE_KEY + E2E_TP_PRACTICE_ID (run the seed first)",
  );

  let createdIds: string[] = [];
  test.afterEach(async () => {
    if (db && createdIds.length) await db.from("incident_report").delete().in("id", createdIds);
    createdIds = [];
  });

  test("log an incident → shows in list → persisted in DB", async ({ page }) => {
    const summary = `E2E incident ${Date.now()}`;

    await page.goto("/governance");
    await page.getByText(/^Incidents/).first().click();
    await page.getByRole("button", { name: "Log incident" }).first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Type + Severity (required selects).
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option").first().click();

    await dialog.locator('input[type="datetime-local"]').fill("2026-06-01T10:00");
    await dialog.getByPlaceholder(/One-line description/).fill(summary);
    await dialog.getByPlaceholder(/What happened, in factual terms/).fill("E2E automated test incident.");

    await dialog.getByRole("button", { name: "Log incident" }).click();

    // Dialog closes and the incident appears in the list.
    await expect(page.getByText(summary)).toBeVisible({ timeout: 15_000 });

    // Persisted.
    const { data, error } = await db!
      .from("incident_report")
      .select("id")
      .eq("practice_id", PRACTICE!)
      .eq("summary", summary);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
    createdIds = (data ?? []).map((r) => r.id as string);
  });
});
