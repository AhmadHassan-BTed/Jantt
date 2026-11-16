import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@jantt/core": resolve(import.meta.dirname, "../core/src")
    }
  },
  build: {
    lib: {
      entry: resolve(import.meta.dirname, "src/standalone.ts"),
      name: "Jantt",
      formats: ["umd", "iife"],
      // UMD is CommonJS-compatible, so it takes .cjs in this "type": "module" package.
      fileName: (format) => (format === "iife" ? "jantt.standalone.iife.js" : "jantt.standalone.umd.cjs"),
      // Emitted as dist/style.css: package.json "style", the "./style.css" export and the CDN docs.
      cssFileName: "style"
    },
    rolldownOptions: {
      output: {
        extend: true,
        exports: "named"
      }
    }
  }
});
