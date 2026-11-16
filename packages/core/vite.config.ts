import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [
    dts({
      rollupTypes: true,
      include: ["src"]
    })
  ],
  build: {
    lib: {
      entry: resolve(import.meta.dirname, "src/index.ts"),
      formats: ["es", "cjs"],
      fileName: (format) => `index.${format === "es" ? "js" : "cjs"}`,
      // Emitted as dist/theme.css, the target of the "./theme.css" and "./style.css" exports.
      cssFileName: "theme"
    },
    rolldownOptions: {
      // Declared in "dependencies": consumers' bundlers resolve and dedupe it.
      external: ["fflate"],
      output: {
        exports: "named"
      }
    }
  }
});
