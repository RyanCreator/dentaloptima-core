import { test, expect } from "./fixtures-tp";
import { db, hasServiceRole } from "./db";

// MUTATING · isolated test practice. Registers an NHS performer for the owner
// staff member through the UI, asserts it in the list + DB, then cleans up.
const STAFF = process.env.E2E_TP_STAFF_ID;
const PRACTICE = process.env.E2E_TP_PRACTICE_ID;

test.describe("staff NHS performer (mutating · test practice)", () => {
  test.skip(
    !hasServiceRole || !STAFF || !PRACTICE,
    "Needs SUPABASE_SERVICE_ROLE_KEY + E2E_TP_STAFF_ID + E2E_TP_PRACTICE_ID",
  );

  let createdIds: string[] = [];
  test.afterEach(async () => {
    if (db && createdIds.length) await db.from("nhs_performer").delete().in("id", createdIds);
    createdIds = [];
  });

  test("register an NHS performer", async ({ page }) => {
    const performerNo = `9${Date.now().toString().slice(-5)}`;

    await page.goto(`/staff/${STAFF}`);
    await page.getByText("NHS performer", { exact: true }).click();
    await page.getByRole("button", { name: "Add registration" }).first().click();

    // The registration form opens in a Sheet (role=dialog).
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await sheet.getByPlaceholder("e.g. 123456", { exact: true }).fill(performerNo);
    await sheet.getByPlaceholder("e.g. 12345", { exact: true }).fill("12345");
    // Effective-from defaults to today — submit.
    await sheet.getByRole("button", { name: "Add registration" }).click();

    // Appears in the registration list.
    await expect(page.getByText(performerNo)).toBeVisible({ timeout: 15_000 });

    // Persisted.
    const { data, error } = await db!
      .from("nhs_performer")
      .select("id")
      .eq("practice_id", PRACTICE!)
      .eq("staff_id", STAFF!)
      .eq("performer_number", performerNo);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
    createdIds = (data ?? []).map((r) => r.id as string);
  });
});
