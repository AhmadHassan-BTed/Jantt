import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:4196";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.pw.ts",
  workers: 2,
  timeout: 150_000,
  use: { baseURL, trace: "retain-on-failure", reducedMotion: "reduce", serviceWorkers: "block" },
  projects: [
    { name: "narrow-chromium", use: { ...devices["Pixel 7"], viewport: { width: 320, height: 680 } } },
    { name: "phone-webkit", use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } } }
  ],
  webServer: { command: "npm run preview -- --host 127.0.0.1 --port 4196 --strictPort", url: baseURL }
});
