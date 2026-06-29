import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const dataDir =
  process.env.SEO_OFFICE_E2E_DATA_DIR ??
  path.join(os.tmpdir(), "seo-office-playwright-e2e");

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["dot"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command:
          `node scripts/e2e/prepare-data-dir.mjs ${JSON.stringify(dataDir)} && ` +
          `SEO_OFFICE_E2E_MOCK_SPECIALISTS=1 ` +
          `SEO_OFFICE_E2E_DEEP_BRAIN_FIXTURE=1 ` +
          `SEO_OFFICE_E2E_FAIL_SPECIALIST=${JSON.stringify(
            process.env.SEO_OFFICE_E2E_FAIL_SPECIALIST ?? "",
          )} ` +
          `SEO_OFFICE_E2E_MOCK_SPECIALIST_DELAY_MS=1000 ` +
          `SEO_OFFICE_DATA_DIR=${JSON.stringify(dataDir)} pnpm exec next start -p ${port}`,
        url: baseURL,
        timeout: 30_000,
        reuseExistingServer: false,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
