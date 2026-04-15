import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

function loadDotEnvIfExists(fileName) {
  const envPath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf-8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadDotEnvIfExists('.env.e2e');

const remoteBaseURL = process.env.E2E_BASE_URL?.trim();
const localBaseURL = process.env.PLAYWRIGHT_LOCAL_BASE_URL?.trim() || 'http://127.0.0.1:4173';
const baseURL = remoteBaseURL || localBaseURL;
const isRemoteTarget = Boolean(remoteBaseURL);

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: isRemoteTarget
    ? undefined
    : {
        command: 'npm run dev -- --host 127.0.0.1 --port 4173',
        url: localBaseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});

