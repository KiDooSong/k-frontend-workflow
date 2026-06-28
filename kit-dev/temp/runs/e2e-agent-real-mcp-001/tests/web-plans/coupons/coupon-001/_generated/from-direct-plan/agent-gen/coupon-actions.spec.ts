// spec: tests/web-plans/coupons/coupon-001/plan.md
// seed: tests/web/seed.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Coupon actions', () => {
  test('should copy a coupon code and confirm in the status line', async ({ page }) => {
    // Navigate to the app home page first
    await page.goto('http://127.0.0.1:3100/');

    // 1. Click the Copy code button on the Free Shipping coupon.
    const freeShipRow = page.getByTestId('coupon-item').filter({ hasText: 'FREESHIP' });
    await freeShipRow.getByTestId('copy-button').click();

    // expect: The status line reads Copied FREESHIP to clipboard.
    await expect(page.getByTestId('status')).toHaveText('Copied FREESHIP to clipboard');
  });

  test('should apply a coupon and reflect the applied state', async ({ page }) => {
    // Navigate to the app home page first
    await page.goto('http://127.0.0.1:3100/');

    // 1. Click the Apply button on the Save 20K coupon.
    const save20Row = page.getByTestId('coupon-item').filter({ hasText: 'SAVE20' });
    await save20Row.getByTestId('apply-button').click();

    // expect: The button label changes to Applied and takes on the applied highlight style.
    await expect(save20Row.getByTestId('apply-button')).toHaveText('Applied');
    await expect(save20Row.getByTestId('apply-button')).toHaveClass(/applied/);

    // expect: The status line reads Applied SAVE20.
    await expect(page.getByTestId('status')).toHaveText('Applied SAVE20');
  });
});
