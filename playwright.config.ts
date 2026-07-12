import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './scripts/e2e',
  testIgnore: ['**/*.real.spec.ts'],
  globalSetup: './scripts/e2e/global-setup.ts',
  globalTeardown: './scripts/e2e/global-teardown.ts',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    channel: 'msedge',
    trace: 'retain-on-failure',
    launchOptions: {
      args: [
        '--use-angle=swiftshader',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
      ],
    },
  },
});
