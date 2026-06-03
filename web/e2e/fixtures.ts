import { test as base, expect } from "@playwright/test";

// Shared test fixture. The booking app resolves its tenant from the hostname;
// `localhost` has no mapping, so we inject the dev-hostname override
// (tenantLoader.ts reads sessionStorage["dev:hostname"] in DEV) into every page
// before any app code runs. Auth comes from the saved storageState (see config).
export const DEV_HOSTNAME = process.env.E2E_DEV_HOSTNAME || "app.dentaloptima.co.uk";

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript((host) => {
      try {
        sessionStorage.setItem("dev:hostname", host as string);
      } catch {
        /* sessionStorage unavailable — ignore */
      }
    }, DEV_HOSTNAME);
    await use(context);
  },
});

export { expect };
