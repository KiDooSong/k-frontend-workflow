// spec: tests/web-plans/coupons/coupon-001/plan.md
// seed: tests/web/seed.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Coupon list', () => {
  test('should list all available coupons with their details', async ({ page }) => {
    // 1. Open the coupon app home page.
    await page.goto('http://127.0.0.1:3100/');

    // expect: The page heading reads Your Coupons.
    await expect(page.getByTestId('page-title')).toBeVisible();

    // expect: The coupon list shows exactly three coupons: Welcome 10%, Free Shipping, and Save 20K.
    await expect(page.getByRole('heading', { name: 'Welcome 10%' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Free Shipping' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Save 20K' })).toBeVisible();
    await expect(page.getByTestId('coupon-item')).toHaveCount(3);

    // 2. Inspect each coupon row in the list.
    // expect: Each row shows its coupon code: WELCOME10, FREESHIP, and SAVE20 respectively, along with its discount text and expiry date.
    await expect(page.getByText('Code WELCOME10 · 10% off ·')).toBeVisible();
    await expect(page.getByText('Code FREESHIP · Free delivery')).toBeVisible();
    await expect(page.getByText('Code SAVE20 · 20,000 KRW off')).toBeVisible();

    // expect: Each row shows a View, a Copy code, and an Apply button.
    const welcome10Row = page.getByRole('listitem').filter({ hasText: 'Welcome 10% Code WELCOME10 ·' });
    await expect(welcome10Row.getByTestId('view-button')).toBeVisible();
    await expect(welcome10Row.getByTestId('copy-button')).toBeVisible();
    await expect(welcome10Row.getByTestId('apply-button')).toBeVisible();

    const freeShipRow = page.getByRole('listitem').filter({ hasText: 'Free Shipping Code FREESHIP ·' });
    await expect(freeShipRow.getByTestId('view-button')).toBeVisible();
    await expect(freeShipRow.getByTestId('copy-button')).toBeVisible();
    await expect(freeShipRow.getByTestId('apply-button')).toBeVisible();

    const save20Row = page.getByRole('listitem').filter({ hasText: 'Save 20K Code SAVE20 ·' });
    await expect(save20Row.getByTestId('view-button')).toBeVisible();
    await expect(save20Row.getByTestId('copy-button')).toBeVisible();
    await expect(save20Row.getByTestId('apply-button')).toBeVisible();
  });
});
