import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { resolve } from "path";

export default defineConfig({
  plugins: [
    dts({
      rollupTypes: true,
      include: ["src"]
    })
  ],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "JanttReact",
      formats: ["es", "cjs"],
      fileName: (format) => `index.${format === "es" ? "js" : "cjs"}`
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime", "@jantt/core"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "@jantt/core": "JanttCore"
        }
      }
    }
  }
});
