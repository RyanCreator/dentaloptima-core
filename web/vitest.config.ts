import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Fast unit tests for pure logic (validators, mappers). Playwright specs live
// in e2e/ and use *.spec.ts; Vitest only picks up *.test.ts under src/.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: true,
  },
});
