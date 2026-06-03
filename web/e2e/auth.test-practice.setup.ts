import { test as setup, expect } from "@playwright/test";
import { TP_HOSTNAME } from "./fixtures-tp";

// Logs in as the isolated test-practice owner and saves the session for the
// "mutating" project. Credentials: E2E_TP_EMAIL / E2E_TP_PASSWORD (seeded by
// `npm run test:e2e:seed`).
const authFile = "e2e/.auth/test-practice.json";

setup("authenticate test practice", async ({ page }) => {
  const email = process.env.E2E_TP_EMAIL;
  const password = process.env.E2E_TP_PASSWORD;
  expect(email && password, "Set E2E_TP_EMAIL / E2E_TP_PASSWORD").toBeTruthy();

  await page.goto(`/?dev_hostname=${TP_HOSTNAME}`);
  await page.locator('input[type="email"]').fill(email!);
  await page.locator('input[type="password"]').fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("link", { name: "Calendar", exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await page.context().storageState({ path: authFile });
});
