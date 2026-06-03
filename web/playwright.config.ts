import { defineConfig, devices } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// Load E2E credentials from web/.env.e2e.local (gitignored via .env.*.local).
// Format: E2E_EMAIL=..., E2E_PASSWORD=..., optionally E2E_DEV_HOSTNAME=...
// Kept out of the repo — never commit real practice credentials.
const envFile = resolve(here, ".env.e2e.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const PORT = 8080;

export default defineConfig({
  testDir: "./e2e",
  // The booking app talks to the shared cloud DB, so tests run serially to keep
  // any (clearly-marked) mutating specs predictable on a shared tenant.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : [["list"], ["html", { open: "never" }]],
  timeout: 45_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true,
    viewport: { width: 1400, height: 900 },
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      // Read-only suite against the demo practice. Mutating specs are excluded.
      name: "chromium",
      testIgnore: /\.mutating\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/state.json" },
      dependencies: ["setup"],
    },
    // Opt-in mutating suite — runs only with E2E_ALLOW_MUTATIONS set, against
    // the isolated test practice (auth via the test-practice setup).
    ...(process.env.E2E_ALLOW_MUTATIONS
      ? [
          { name: "setup-tp", testMatch: /auth\.test-practice\.setup\.ts/ },
          {
            name: "mutating",
            testMatch: /\.mutating\.spec\.ts/,
            use: {
              ...devices["Desktop Chrome"],
              storageState: "e2e/.auth/test-practice.json",
            },
            dependencies: ["setup-tp"],
          },
        ]
      : []),
  ],
  // Auto-start the Vite dev server if it isn't already running.
  webServer: {
    command: "npm run dev",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
