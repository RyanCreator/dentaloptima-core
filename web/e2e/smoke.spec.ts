import { test, expect } from "./fixtures";

// Every top-level route loads, renders the app shell, and produces no genuine
// console / page errors. Benign request-aborts (React Query cancelling in-flight
// fetches on navigation) are filtered out.
const ROUTES = [
  "/",
  "/enquiries",
  "/calendar",
  "/patients",
  "/waiting-list",
  "/recalls",
  "/cancellations",
  "/claims",
  "/staff",
  "/documents",
  "/outstanding",
  "/governance",
  "/settings/clinic",
  "/settings/hours",
  "/settings/appointments",
  "/settings/templates",
  "/settings/services",
  "/settings/consents",
  "/settings/account",
  "/help",
  "/glossary",
];

const BENIGN = /ERR_ABORTED|aborted|Failed to load resource|net::ERR_/i;

for (const path of ROUTES) {
  test(`loads ${path} cleanly`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error" && !BENIGN.test(m.text())) errors.push(`console: ${m.text()}`);
    });

    await page.goto(path);

    // Not stuck on the "domain not configured" gate.
    await expect(page.getByText(/Booking app not configured/i)).toHaveCount(0);
    // App shell rendered. (The sidebar auto-collapses on /settings, so assert
    // the always-present TopBar sidebar toggle rather than a nav link.)
    await expect(page.getByRole("button", { name: /Toggle Sidebar/i })).toBeVisible();
    // No error-boundary fallback.
    await expect(page.getByText(/something went wrong|unexpected error/i)).toHaveCount(0);

    expect(errors, `Console/page errors on ${path}:\n${errors.join("\n")}`).toEqual([]);
  });
}
