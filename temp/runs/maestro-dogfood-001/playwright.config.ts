import { defineConfig, devices } from '@playwright/test';

// Dogfood config — drives the figma-fidelity-001 Expo *web* build (react-native-web).
// The app uses query-param navigation (?screen=l010), NOT expo-router.
// Server: reuse the already-running Expo web dev server on :19006 (started via preview),
// otherwise start it from the app dir.
export default defineConfig({
  testDir: './tests',                  // excludes root seed.spec.ts + specs/ from the run
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,     // local 0 => flake surfaces immediately (research §d.2)
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:19006',
    trace: 'on-first-retry',           // cheap + debuggable; 'on' would explode artifacts
    screenshot: 'only-on-failure',
    // testIdAttribute stays default 'data-testid' (RNW emits RN testID -> data-testid).
    // NOTE: this app ships ZERO testID, so the suite hooks via getByRole + accessible name.
  },
  webServer: {
    command: 'npm run web -- --port 19006',
    cwd: '../figma-fidelity-001/app',
    url: 'http://localhost:19006',
    reuseExistingServer: true,         // preview already holds :19006
    timeout: 180_000,                  // Metro first web bundle is slow
    stdout: 'pipe',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
