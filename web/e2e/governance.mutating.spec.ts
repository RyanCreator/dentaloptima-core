import { test, expect } from "./fixtures-tp";
import { db, hasServiceRole } from "./db";

// MUTATING · isolated test practice. Exercises the four Governance create flows
// through the UI, asserts each in the DB, and cleans up via service-role.
const PRACTICE = process.env.E2E_TP_PRACTICE_ID;
const stamp = () => Date.now().toString().slice(-8);

test.describe("governance create flows (mutating · test practice)", () => {
  test.skip(
    !hasServiceRole || !PRACTICE,
    "Needs SUPABASE_SERVICE_ROLE_KEY + E2E_TP_PRACTICE_ID (run the seed first)",
  );

  // Track created rows across tables for teardown.
  const created: { table: string; id: string }[] = [];
  test.afterEach(async () => {
    if (db) {
      for (const { table, id } of created) await db.from(table).delete().eq("id", id);
    }
    created.length = 0;
  });

  async function openTab(page: import("@playwright/test").Page, tab: RegExp, button: string) {
    await page.goto("/governance");
    await page.getByText(tab).first().click();
    await page.getByRole("button", { name: button }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    return dialog;
  }
  const pickFirstOption = async (page: import("@playwright/test").Page) =>
    page.getByRole("option").first().click();

  test("log an incident", async ({ page }) => {
    const summary = `E2E incident ${stamp()}`;
    const dialog = await openTab(page, /^Incidents/, "Log incident");
    await dialog.getByRole("combobox").nth(0).click(); await pickFirstOption(page);
    await dialog.getByRole("combobox").nth(1).click(); await pickFirstOption(page);
    await dialog.locator('input[type="datetime-local"]').fill("2026-06-01T10:00");
    await dialog.getByPlaceholder(/One-line description/).fill(summary);
    await dialog.getByPlaceholder(/What happened, in factual terms/).fill("E2E automated incident.");
    await dialog.locator('button[type="submit"]').click();

    await expect(page.getByText(summary)).toBeVisible();
    const { data } = await db!.from("incident_report").select("id").eq("practice_id", PRACTICE!).eq("summary", summary);
    expect(data?.length).toBe(1);
    created.push({ table: "incident_report", id: data![0].id as string });
  });

  test("record a complaint", async ({ page }) => {
    const summary = `E2E complaint ${stamp()}`;
    const dialog = await openTab(page, /^Complaints/, "Record complaint");
    await dialog.getByPlaceholder(/Full name of the person complaining/).fill("E2E Complainant");
    await dialog.locator('input[type="datetime-local"]').fill("2026-06-01T10:00");
    await dialog.getByRole("combobox").first().click(); await pickFirstOption(page);
    await dialog.getByPlaceholder(/One-line description/).fill(summary);
    await dialog.getByPlaceholder(/What the patient said/).fill("E2E automated complaint detail.");
    await dialog.locator('button[type="submit"]').click();

    await expect(page.getByText(summary)).toBeVisible();
    const { data } = await db!.from("complaint").select("id").eq("practice_id", PRACTICE!).eq("summary", summary);
    expect(data?.length).toBe(1);
    created.push({ table: "complaint", id: data![0].id as string });
  });

  test("raise a safeguarding concern", async ({ page }) => {
    const desc = `E2E safeguarding concern ${stamp()}`;
    const dialog = await openTab(page, /^Safeguarding/, "Raise concern");
    await dialog.getByRole("combobox").first().click(); await pickFirstOption(page);
    await dialog.getByPlaceholder(/What you observed/).fill(desc);
    await dialog.locator('input[type="checkbox"]').first().check().catch(() => {});
    await dialog.locator('button[type="submit"]').click();

    // Safeguarding records are confidential — assert via DB (dialog closes).
    await expect(dialog).toBeHidden();
    const { data } = await db!.from("safeguarding_concern").select("id").eq("practice_id", PRACTICE!).eq("description", desc);
    expect(data?.length).toBe(1);
    created.push({ table: "safeguarding_concern", id: data![0].id as string });
  });

  test("create a policy", async ({ page }) => {
    const title = `E2E Policy ${stamp()}`;
    const dialog = await openTab(page, /^Policies/, "New policy");
    await dialog.getByRole("combobox").first().click(); await pickFirstOption(page);
    await dialog.getByPlaceholder(/e\.g\. 1\.0/).fill("1.0");
    await dialog.getByPlaceholder(/Patient consent policy/).fill(title);
    await dialog.locator('input[type="date"]').first().fill("2026-06-01");
    await dialog.getByPlaceholder(/The full policy text/).fill("## Scope\nE2E automated policy content.");
    await dialog.locator('button[type="submit"]').click();

    await expect(page.getByText(title)).toBeVisible();
    const { data } = await db!.from("policy").select("id").eq("practice_id", PRACTICE!).eq("title", title);
    expect(data?.length).toBe(1);
    created.push({ table: "policy", id: data![0].id as string });
  });
});
