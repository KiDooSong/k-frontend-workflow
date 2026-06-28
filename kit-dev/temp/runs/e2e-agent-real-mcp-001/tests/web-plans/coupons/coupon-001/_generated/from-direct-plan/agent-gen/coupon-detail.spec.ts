// spec: tests/web-plans/coupons/coupon-001/plan.md
// seed: tests/web/seed.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Coupon detail', () => {
  test('should open the detail view for a coupon', async ({ page }) => {
    // Navigate to the app home page first
    await page.goto('http://127.0.0.1:3100/');

    // 1. Click the View button on the Welcome 10% coupon.
    const welcome10Row = page.getByRole('listitem').filter({ hasText: 'Welcome 10%' });
    await welcome10Row.getByTestId('view-button').click();

    // expect: The coupon list is hidden.
    await expect(page.getByTestId('coupon-list')).not.toBeVisible();

    // expect: The detail view shows the title Welcome 10%.
    await expect(page.getByTestId('detail-title')).toHaveText('Welcome 10%');

    // expect: A meta line containing code WELCOME10 with its discount and expiry.
    await expect(page.getByTestId('detail-meta')).toHaveText('Code WELCOME10 · 10% off · expires 2026-12-31');

    // expect: The description First order discount for new members.
    await expect(page.getByTestId('detail-desc')).toHaveText('First order discount for new members.');
  });

  test('should return to the list from the detail view', async ({ page }) => {
    // Navigate to the app home page first
    await page.goto('http://127.0.0.1:3100/');

    // 1. Open the Welcome 10% detail view, then click the Back button.
    const welcome10Row = page.getByRole('listitem').filter({ hasText: 'Welcome 10%' });
    await welcome10Row.getByTestId('view-button').click();

    // Verify detail view is open before going back
    await expect(page.getByTestId('detail-back')).toBeVisible();

    // Click the Back button
    await page.getByTestId('detail-back').click();

    // expect: The detail view is hidden.
    await expect(page.getByTestId('coupon-detail')).not.toBeVisible();

    // expect: The coupon list is shown again with all three coupons.
    await expect(page.getByRole('heading', { name: 'Welcome 10%' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Free Shipping' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Save 20K' })).toBeVisible();
  });
});
