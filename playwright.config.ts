import { defineConfig, devices } from '@playwright/test';

// Two kinds of end-to-end tests:
//  - e2e/*.spec.ts run against a mocked backend (Playwright answers the
//    Supabase and function requests), so they run anywhere, including CI.
//  - e2e/fullstack/*.spec.ts need the real local stack (`supabase start` and
//    `netlify dev` in the backend repo). Run them with E2E_FULLSTACK=1.
const fullstack = process.env.E2E_FULLSTACK === '1';
const port = Number(process.env.E2E_PORT ?? 5174);

export default defineConfig({
  testDir: 'e2e',
  testMatch: fullstack ? 'fullstack/**/*.spec.ts' : '*.spec.ts',
  testIgnore: fullstack ? [] : ['**/fullstack/**'],
  timeout: 45_000,
  fullyParallel: !fullstack,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 860 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: fullstack ? [] : ['smoke.spec.ts'] },
  ],
  webServer: {
    command: `npx vite --port ${port} --strictPort`,
    port,
    reuseExistingServer: !process.env.CI,
    env: fullstack
      ? {}
      : {
          VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
          VITE_SUPABASE_ANON_KEY: 'e2e-anon-key',
        },
  },
});
