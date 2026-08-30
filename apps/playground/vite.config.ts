import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@jantt/core": resolve(__dirname, "../../packages/core/src/index.ts"),
      "@jantt/react": resolve(__dirname, "../../packages/react/src/index.ts")
    }
  },
  server: {
    port: 5173,
    host: true
  }
});
