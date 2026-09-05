import { defineConfig, devices } from "@playwright/test";

const ADMIN_BASE_URL = process.env.ADMIN_BASE_URL ?? "http://localhost:9000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL: ADMIN_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "seed",
      testMatch: /seed\.setup\.ts/,
    },
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      dependencies: ["seed"],
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/admin.json",
      },
      dependencies: ["setup"],
    },
  ],
});
