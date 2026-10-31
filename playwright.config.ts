import {defineConfig} from '@playwright/test';

const ci = !!process.env.CI;

export default defineConfig({
  testDir: 'tests/browser',
  // CI draws the full WebGL scene with SwiftShader. Allow time for rendering
  // and screenshots without changing the application's hardware deadlines.
  timeout: ci ? 120000 : 45000,
  expect: {timeout: ci ? 20000 : 5000},
  workers: 1,
  forbidOnly: ci,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173/rehab_neon_rider/',
    viewport: {width: 1440, height: 900},
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {}),
      args: ['--use-angle=swiftshader', '--enable-webgl', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: 'node tools/static-server.mjs',
    url: 'http://127.0.0.1:4173/rehab_neon_rider/',
    reuseExistingServer: !ci,
  },
});
