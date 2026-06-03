import { test as base, expect } from "@playwright/test";

// Fixture for mutating specs that run against the ISOLATED test practice.
// Injects that practice's dev-hostname; auth (test-practice storageState) is
// wired in playwright.config.ts on the "mutating" project.
export const TP_HOSTNAME = process.env.E2E_TP_HOSTNAME || "e2e.dentaloptima.test";

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript((host) => {
      try {
        sessionStorage.setItem("dev:hostname", host as string);
      } catch {
        /* ignore */
      }
    }, TP_HOSTNAME);
    await use(context);
  },
});

export { expect };
