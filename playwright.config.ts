import { defineConfig, devices } from "@playwright/test";

// e2e tests run against the statically built Storybook (npm run build-storybook).
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:6007",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx http-server storybook-static -p 6007 -s",
    url: "http://127.0.0.1:6007",
    reuseExistingServer: !process.env.CI,
  },
});
