import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "JanttYjs",
      formats: ["es", "cjs"],
      fileName: (format) => `index.${format === "es" ? "js" : "cjs"}`
    },
    rollupOptions: {
      external: ["yjs", "@jantt/core"]
    }
  },
  test: {
    globals: true,
    environment: "node"
  }
});
