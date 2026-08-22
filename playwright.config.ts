import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";
import { existsSync } from "node:fs";

// Authenticated specs read BROWSER_ADMIN_USERNAME / BROWSER_ADMIN_PASSWORD.
// Without this load they are unset, every authenticated spec `test.skip`s, and
// the run still prints green — see TESTING.md.
config({ path: ".env.local", quiet: true });

// Point BROWSER_BASE_URL at a server you already started (e.g. a production
// build on a free port) and Playwright will not start or reuse one of its own.
// That matters because `reuseExistingServer` silently attaches to whatever is
// already listening on the port, which may be a stale server from another
// session running different code.
const externalBaseURL = process.env.BROWSER_BASE_URL;
const port = Number(process.env.BROWSER_PORT ?? 3100);
const baseURL = externalBaseURL ?? `http://127.0.0.1:${port}`;
const systemChromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browserExecutablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? (existsSync(systemChromePath) ? systemChromePath : undefined);

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    ...(browserExecutablePath
      ? { launchOptions: { executablePath: browserExecutablePath } }
      : {}),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: externalBaseURL
    ? undefined
    : {
        command: `npx next dev -p ${port}`,
        url: `${baseURL}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
