import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../..");
const workspaceSource = (pkg: string) => resolve(repoRoot, `packages/${pkg}/src/index.ts`);

export default defineConfig(({ mode }) => {
  // One .env at the repo root (see .env.example) configures both the app and the dev server.
  const env = loadEnv(mode, repoRoot, "PLAYGROUND_");

  return {
    base: "./",
    envDir: repoRoot,
    plugins: [react()],
    resolve: {
      // Build workspace packages from source: no prior package build needed, HMR across packages.
      alias: {
        "@jantt/core": workspaceSource("core"),
        "@jantt/react": workspaceSource("react"),
        "@jantt/interop": workspaceSource("interop"),
        "@jantt/render-canvas": workspaceSource("render-canvas")
      }
    },
    server: {
      // Loopback by default; set PLAYGROUND_HOST=0.0.0.0 to test from other devices on the LAN.
      host: env.PLAYGROUND_HOST || "localhost",
      port: Number(env.PLAYGROUND_PORT) || 5173
    },
    build: {
      rolldownOptions: {
        output: {
          // Long-lived vendor chunks stay cached across app deploys and download in parallel.
          codeSplitting: {
            groups: [
              { name: "vendor-firebase", test: /[\\/]node_modules[\\/](firebase|@firebase)[\\/]/, priority: 20 },
              { name: "vendor-react", test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 20 },
              { name: "vendor", test: /[\\/]node_modules[\\/]/, priority: 10 }
            ]
          }
        }
      }
    }
  };
});
