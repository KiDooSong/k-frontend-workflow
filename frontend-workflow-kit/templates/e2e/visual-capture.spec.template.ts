import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// Visual capture provenance:
// - canonical screen_id: {SCREEN_ID}
// - route/seed: {ROUTE_OR_SEED_URL}
// - entry_context: {direct-entry|journey-entry|native-only}
// - Playwright project/viewport: {PROJECT_OR_VIEWPORT}
// - Expo/web command assumptions: {EXPO_WEB_COMMAND_AND_PORT_ASSUMPTIONS}
// - E2E_RUN_ID: ${E2E_RUN_ID}
// - artifact path: .playwright-results/${E2E_RUN_ID}/screenshots/{domain}/{screen-slug}/{state}.png
//
// Native-only rows should not produce a web screenshot spec. Escalate native
// header/back/close behavior, safe area/system chrome, native modules, gestures,
// platform-specific animations, and mobile parity to device automation.
//
// Direct-entry URLs may not reproduce an Expo Router journey stack. If header,
// back, close, modal, or shell chrome matters, use a journey-entry setup path.

test('@visual {SCREEN_ID} {STATE_NAME} capture', async ({ page }) => {
  const runId = process.env.E2E_RUN_ID ?? 'local';
  const artifactPath = join(
    '.playwright-results',
    runId,
    'screenshots',
    '{domain}',
    '{screen-slug}',
    '{state}.png',
  );

  await mkdir(dirname(artifactPath), { recursive: true });

  // For direct-entry, navigate to the route or seed URL.
  // For journey-entry, replace this with the documented setup path that builds
  // the intended navigation stack before capture.
  await page.goto('{ROUTE_OR_SEED_URL}');

  const root = page.getByTestId('{screen-root-testid}');

  // Synchronization only. This is not a visual approval assertion.
  await expect(root).toBeVisible();

  // Advisory evidence only. This template intentionally avoids visual regression
  // baseline semantics.
  await root.screenshot({ path: artifactPath });
});
