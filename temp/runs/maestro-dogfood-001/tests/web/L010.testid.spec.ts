import { test, expect } from '@playwright/test';

// EXPERIMENT B — same flow as L010.spec.ts but hooked via testID (research-recommended policy).
// REQUIRES the app-testid patch (see ../app-testid.patch / run-report F2) — components now carry
// testID, which RNW emits as data-testid (verified live: 8 anchors on L010, 2 on result, 1 on home).
//
// PAYOFF vs the getByRole baseline:
//   - selectors no longer couple to copy: `signup-provider-google` instead of `Google로 가입하기`.
//   - title hook survives copy/markup change: `signup-title` instead of getByText('회원가입').
//   - value assertion uses a stable anchor + the DATA under test: getByTestId('result-value').toHaveText('kakao').

const L010 = '/?screen=l010';

const L010_ANCHORS = [
  'nav-back', 'nav-close', 'signup-title',
  'signup-provider-kakao', 'signup-provider-google', 'signup-provider-apple', 'signup-provider-email',
  'signup-to-login',
];

test.describe('L010 (testID) — renders (State Matrix: default)', () => {
  test('shows all anchors', async ({ page }) => {
    await page.goto(L010);
    for (const id of L010_ANCHORS) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
  });
});

test.describe('L010 (testID) — provider / login selection (Interaction Matrix)', () => {
  // email omitted — it drifted to the J020 flow (see the drift test below).
  for (const provider of ['kakao', 'google', 'apple']) {
    test(`tap signup-provider-${provider} -> result-value "${provider}"`, async ({ page }) => {
      await page.goto(L010);
      await page.getByTestId(`signup-provider-${provider}`).click();
      await expect(page.getByTestId('result-label')).toBeVisible();
      await expect(page.getByTestId('result-value')).toHaveText(provider);
    });
  }

  test('tap signup-to-login -> result-value "login" (demo placeholder; U-L010-2 open)', async ({ page }) => {
    await page.goto(L010);
    await page.getByTestId('signup-to-login').click();
    await expect(page.getByTestId('result-value')).toHaveText('login');
  });

  // DRIFT (F9): email now routes to the J020 email-signup form (concurrent app change), not the result.
  // J020 screens carry no testID (outside this patch) → assert via text. Stale screen-spec row needs reconcile.
  test('tap signup-provider-email -> J020 email signup form (drift from spec)', async ({ page }) => {
    await page.goto(L010);
    await page.getByTestId('signup-provider-email').click();
    await expect(page.getByText('이메일로 회원가입')).toBeVisible();
  });
});

test.describe('L010 (testID) — navigation (back / close)', () => {
  test('result back -> returns to signup', async ({ page }) => {
    await page.goto(L010);
    await page.getByTestId('signup-provider-kakao').click();
    await expect(page.getByTestId('result-value')).toHaveText('kakao');
    await page.getByTestId('nav-back').click();
    await expect(page.getByTestId('signup-title')).toBeVisible();
  });

  test('close -> returns home', async ({ page }) => {
    await page.goto(L010);
    await page.getByTestId('nav-close').click();
    await expect(page.getByTestId('home-login-cta')).toBeVisible();
  });
});

test.describe('L010 (testID) — full entry from home (nav-graph)', () => {
  test('home -> tap home-login-cta -> L010 opens', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('home-login-cta')).toBeVisible();
    await page.getByTestId('home-login-cta').click();
    await expect(page.getByTestId('signup-title')).toBeVisible();
  });
});
