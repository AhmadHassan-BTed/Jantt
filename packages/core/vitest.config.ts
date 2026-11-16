import { defineConfig } from "vitest/config";

// Test-only config, so test runs never load the build plugins in vite.config.ts.
export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom"
  }
});
