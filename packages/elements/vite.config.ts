import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// `tsc` emits the npm entry (dist/index.js, importing "@jantt/core"). This build adds
// dist/jantt-elements.js, a self-contained ES module for <script type="module"> / CDN use.
export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, "src/index.ts"),
      formats: ["es"],
      fileName: () => "jantt-elements.js"
    }
  },
  test: {
    globals: true,
    environment: "jsdom"
  }
});
