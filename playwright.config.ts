import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90000,
  // Public examples include 1–2 MB original-evidence archives. Keep assertions
  // identical but allow real cross-region download time, unlike localhost.
  expect: { timeout: process.env.ASSHOWN_TEST_URL ? 45000 : 20000 },
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: process.env.ASSHOWN_TEST_URL || "http://localhost:3000",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    launchOptions:
      process.platform === "win32"
        ? {
            executablePath:
              "C:/Program Files/Google/Chrome/Application/chrome.exe",
          }
        : {},
  },
  webServer: process.env.ASSHOWN_TEST_URL
    ? undefined
    : {
        command: "npm run dev -- -p 3000",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 90000,
        env: {
          ASSHOWN_TOKEN_SECRET: "browser-test-only-not-a-real-secret-".repeat(
            3,
          ),
          YOUCAM_ALLOW_GENERATION: "false",
          YOUCAM_PREPAID_ONLY_CONFIRMED: "false",
          NEXT_TELEMETRY_DISABLED: "1",
        },
      },
});
