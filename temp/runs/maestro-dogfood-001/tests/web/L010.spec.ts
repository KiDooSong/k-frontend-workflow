import { test, expect } from '@playwright/test';

// Produced-by-role: Generator (hand-played; EVERY locator below was verified against the
// live react-native-web DOM at :19006 via accessibility snapshot before serialization).
// spec: specs/L010.plan.md
// seed: seed.spec.ts
//
// SELECTOR POLICY (research doc 01 §c.2 / doc 02 §b-4):
//   Primary hook would be testID -> data-testid, BUT this app ships ZERO testID, so we fall back
//   to getByRole + accessible name (RNW maps accessibilityRole/Label -> role/aria-label).
//   "회원가입" is plain <Text> (no header role) => getByText, NOT getByRole('heading') — verified live.

const L010 = '/?screen=l010';

test.describe('L010 — renders (State Matrix: default)', () => {
  test('shows all 7 sections in order', async ({ page }) => {
    await page.goto(L010);
    await expect(page.getByRole('button', { name: '뒤로 가기' })).toBeVisible();
    await expect(page.getByRole('button', { name: '닫기' })).toBeVisible();
    await expect(page.getByText('회원가입')).toBeVisible();
    await expect(page.getByRole('button', { name: 'kakao로 가입하기' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Google로 가입하기' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apple로 가입하기' })).toBeVisible();
    await expect(page.getByText('또는')).toBeVisible();
    await expect(page.getByRole('button', { name: '이메일로 가입하기' })).toBeVisible();
    await expect(page.getByText('이미 계정이 있으신가요?')).toBeVisible();
    await expect(page.getByRole('link', { name: '로그인하기' })).toBeVisible();
  });
});

test.describe('L010 — provider / login selection (Interaction Matrix)', () => {
  // NOTE: email is intentionally NOT here — it drifted to the J020 flow (see the drift test below).
  const providers = [
    { label: 'kakao로 가입하기', value: 'kakao' },
    { label: 'Google로 가입하기', value: 'google' },
    { label: 'Apple로 가입하기', value: 'apple' },
  ];
  for (const { label, value } of providers) {
    test(`tap "${label}" -> result shows "${value}"`, async ({ page }) => {
      await page.goto(L010);
      await page.getByRole('button', { name: label }).click();
      await expect(page.getByText('선택한 값')).toBeVisible();
      await expect(page.getByText(value, { exact: true })).toBeVisible();
    });
  }

  // U-L010-2 OPEN: assert ONLY the demo placeholder (result "login"), not a real login screen.
  test('tap "로그인하기" link -> result shows "login" (demo placeholder)', async ({ page }) => {
    await page.goto(L010);
    await page.getByRole('link', { name: '로그인하기' }).click();
    await expect(page.getByText('선택한 값')).toBeVisible();
    await expect(page.getByText('login', { exact: true })).toBeVisible();
  });

  // DRIFT (F9): screen-spec Interaction Matrix says "이메일 가입 → 결과 'email'", but a concurrent app
  // change rerouted "이메일로 가입하기" to the J020 email-signup form. Test reflects CURRENT reality;
  // the stale screen-spec row needs reconcile (NOT a silent green — see run-report F9).
  test('tap "이메일로 가입하기" -> J020 email signup form (drift from spec)', async ({ page }) => {
    await page.goto(L010);
    await page.getByRole('button', { name: '이메일로 가입하기' }).click();
    await expect(page.getByText('이메일로 회원가입')).toBeVisible();
  });
});

test.describe('L010 — navigation (back / close)', () => {
  test('result back -> returns to signup', async ({ page }) => {
    await page.goto(L010);
    await page.getByRole('button', { name: 'kakao로 가입하기' }).click();
    await expect(page.getByText('kakao', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '뒤로 가기' }).click();
    await expect(page.getByText('회원가입')).toBeVisible();
  });

  test('close -> returns home', async ({ page }) => {
    await page.goto(L010);
    await page.getByRole('button', { name: '닫기' }).click();
    await expect(page.getByRole('button', { name: '로그인' })).toBeVisible();
  });
});

test.describe('L010 — full entry from home (nav-graph)', () => {
  test('home -> tap 로그인 -> L010 opens', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: '로그인' })).toBeVisible();
    await page.getByRole('button', { name: '로그인' }).click();
    await expect(page.getByText('회원가입')).toBeVisible();
  });
});
