import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [
    dts({
      include: ["src"],
      entryRoot: "src",
      // tsconfig "paths" only points type-checking at the core sources in this monorepo.
      // Published typings must keep importing the "@jantt/core" package, so neither rewrite
      // that import to a relative path nor inline core's declarations (rollupTypes).
      pathsToAliases: false
    })
  ],
  build: {
    lib: {
      entry: resolve(import.meta.dirname, "src/index.ts"),
      formats: ["es", "cjs"],
      fileName: (format) => `index.${format === "es" ? "js" : "cjs"}`
    },
    rolldownOptions: {
      external: ["react", "react-dom", "react/jsx-runtime", "@jantt/core"],
      output: {
        exports: "named"
      }
    }
  }
});
