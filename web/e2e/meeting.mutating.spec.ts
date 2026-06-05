import { test, expect } from "./fixtures-tp";
import { db, hasServiceRole } from "./db";

// MUTATING · isolated test practice. Exercises Meeting Mode end to end through
// the real UI: record (manual-typing fallback) -> save -> detail -> add action
// -> toggle -> finalise, asserting persistence in the DB. We force the
// browser-speech fallback by removing SpeechRecognition so the run is
// deterministic without a microphone. Each run uses a unique title and cleans
// up after itself.
const PRACTICE = process.env.E2E_TP_PRACTICE_ID;
const TITLE = `E2E Meeting ${Date.now().toString().slice(-7)}`;

test.describe("Meeting Mode (mutating · test practice)", () => {
  test.skip(!hasServiceRole || !PRACTICE, "Needs service-role + the seeded test practice");

  // Strip live speech so the recorder shows the manual-typing fallback.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      // @ts-expect-error - test-only teardown of the Web Speech API
      delete window.SpeechRecognition;
      // @ts-expect-error - test-only teardown of the Web Speech API
      delete window.webkitSpeechRecognition;
    });
  });

  async function cleanup() {
    if (!db) return;
    const { data } = await db.from("meeting").select("id").eq("practice_id", PRACTICE!).eq("title", TITLE);
    for (const m of data ?? []) {
      await db.from("meeting_action").delete().eq("meeting_id", m.id);
      await db.from("meeting").delete().eq("id", m.id);
    }
  }
  test.afterEach(cleanup);

  test("record → save → action → finalise, persisted", async ({ page }) => {
    await page.goto("/governance?tab=meetings");

    await page.getByRole("button", { name: "Record meeting" }).first().click();
    await expect(page.getByText("Record a meeting")).toBeVisible();

    await page.getByPlaceholder("e.g. Monday morning huddle").fill(TITLE);
    await page.getByLabel("Transcript / notes").fill("Discussed the new recall workflow and rota.");
    await page.getByRole("button", { name: "Save meeting" }).click();

    // Lands on the detail page.
    await expect(page.getByRole("heading", { name: TITLE }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Discussed the new recall workflow")).toBeVisible();

    // Add an action item. Invoke the button's handler directly — the transient
    // "saved" toast sits over this bottom-right button, so a coordinate click
    // (even force) would land on the toast.
    await page.getByPlaceholder("What needs doing?").fill("Update the recall template");
    await page.getByPlaceholder("Name", { exact: true }).fill("Maya");
    await page.getByRole("button", { name: "Add action" }).evaluate((el) => (el as HTMLButtonElement).click());
    await expect(page.getByText("Update the recall template")).toBeVisible();

    // Toggle it done.
    await page.getByRole("checkbox").first().click();

    // Finalise the meeting.
    await page.getByRole("button", { name: "Finalise" }).click();
    await expect(page.getByText("Final", { exact: true }).first()).toBeVisible();

    // Persisted as expected.
    await expect.poll(async () => {
      const { data } = await db!.from("meeting")
        .select("status, transcript, meeting_action(description, status)")
        .eq("practice_id", PRACTICE!).eq("title", TITLE).maybeSingle();
      return data;
    }, { timeout: 15_000 }).toMatchObject({
      status: "FINAL",
      meeting_action: [{ description: "Update the recall template", status: "DONE" }],
    });
  });
});
