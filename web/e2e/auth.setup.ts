import { test as setup, expect } from "@playwright/test";
import { DEV_HOSTNAME } from "./fixtures";

// Logs in once via the UI and persists the session to e2e/.auth/state.json,
// which every other spec reuses (see playwright.config.ts). Credentials come
// from web/.env.e2e.local (E2E_EMAIL / E2E_PASSWORD) — never hard-coded.
const authFile = "e2e/.auth/state.json";

setup("authenticate", async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  expect(
    email && password,
    "Set E2E_EMAIL and E2E_PASSWORD in web/.env.e2e.local",
  ).toBeTruthy();

  // ?dev_hostname resolves the tenant on the (pre-auth) login page.
  await page.goto(`/?dev_hostname=${DEV_HOSTNAME}`);
  await page.locator('input[type="email"]').fill(email!);
  await page.locator('input[type="password"]').fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Authenticated shell is up once the sidebar nav renders.
  await expect(page.getByRole("link", { name: "Calendar", exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await page.context().storageState({ path: authFile });
});
