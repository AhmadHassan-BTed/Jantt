import { defineConfig } from "vitest/config";

// Test config only: the package is built with `tsc -p tsconfig.json`.
export default defineConfig({
  test: {
    globals: true,
    environment: "node"
  }
});
