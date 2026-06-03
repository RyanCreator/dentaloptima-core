import { test, expect } from "./fixtures-tp";
import { db, hasServiceRole } from "./db";

// MUTATING · isolated test practice. Covers the enquiry decision flow (reject +
// add-to-waitlist) and the recall action. State is reset to a known baseline
// before each test and cleaned up after, via the service-role client.
const PRACTICE = process.env.E2E_TP_PRACTICE_ID;
const ENQUIRY = process.env.E2E_TP_ENQUIRY_ID;
const RECALL = process.env.E2E_TP_RECALL_ID;

test.describe("enquiries / waitlist / recalls (mutating · test practice)", () => {
  test.skip(
    !hasServiceRole || !PRACTICE || !ENQUIRY || !RECALL,
    "Needs service-role + seeded enquiry/recall (run the seed first)",
  );

  // Deterministic baseline before each test; same reset after.
  async function reset() {
    if (!db) return;
    await db.from("booking_request").update({ status: "NEW" }).eq("id", ENQUIRY!);
    await db.from("recall").update({ status: "PENDING" }).eq("id", RECALL!);
    await db.from("waiting_list").delete().eq("practice_id", PRACTICE!);
    await db.from("patient").delete().eq("practice_id", PRACTICE!).eq("last_name", "Enquiry");
  }
  test.beforeEach(reset);
  test.afterEach(reset);

  test("reject an enquiry (with reason)", async ({ page }) => {
    await page.goto(`/enquiries/${ENQUIRY}`);
    await page.getByRole("button", { name: /Reject enquiry/ }).first().click();
    // Inline reason picker, then the confirm button.
    await page.getByRole("combobox").first().click();
    await page.getByRole("option").first().click();
    await page.getByRole("button", { name: /Reject enquiry/ }).last().click();

    await expect.poll(async () => {
      const { data } = await db!.from("booking_request").select("status").eq("id", ENQUIRY!);
      return data?.[0]?.status;
    }, { timeout: 15_000 }).toBe("REJECTED");
  });

  test("add an enquiry to the waitlist", async ({ page }) => {
    await page.goto(`/enquiries/${ENQUIRY}`);
    await page.getByRole("button", { name: /Add to waitlist/ }).first().click();
    // Select a service (the confirm button is disabled until one is chosen).
    await page.getByRole("checkbox").first().check();
    await page.getByRole("button", { name: /Add to waitlist \(\d+ service/ }).click();

    await expect.poll(async () => {
      const { count } = await db!
        .from("waiting_list")
        .select("id", { count: "exact", head: true })
        .eq("practice_id", PRACTICE!);
      return count ?? 0;
    }, { timeout: 15_000 }).toBeGreaterThan(0);
  });

  test("mark a recall done", async ({ page }) => {
    await page.goto("/recalls");
    await page.getByText("E2E Patient").first().waitFor({ state: "visible", timeout: 15_000 });
    await page.getByRole("button", { name: "Done" }).first().click();

    await expect.poll(async () => {
      const { data } = await db!.from("recall").select("status").eq("id", RECALL!);
      return data?.[0]?.status;
    }, { timeout: 15_000 }).toBe("COMPLETED");
  });
});
