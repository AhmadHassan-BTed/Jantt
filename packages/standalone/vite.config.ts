import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@jantt/core": resolve(__dirname, "../core/src")
    }
  },
  build: {
    lib: {
      entry: resolve(__dirname, "src/standalone.ts"),
      name: "Jantt",
      formats: ["umd", "iife"],
      fileName: (format) => `jantt.standalone.${format === "iife" ? "iife.js" : "js"}`
    },
    rollupOptions: {
      output: {
        extend: true
      }
    }
  }
});
