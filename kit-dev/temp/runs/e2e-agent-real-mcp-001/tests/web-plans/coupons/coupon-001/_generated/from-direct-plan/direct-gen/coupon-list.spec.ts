import { test, expect } from '@playwright/test';

test.describe('Coupon list', () => {
  test('should list all available coupons with their details', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByTestId('page-title')).toHaveText('Your Coupons');

    const items = page.getByTestId('coupon-item');
    await expect(items).toHaveCount(3);

    const expected = [
      { id: 'WELCOME10', title: 'Welcome 10%', meta: 'Code WELCOME10 · 10% off · expires 2026-12-31' },
      { id: 'FREESHIP', title: 'Free Shipping', meta: 'Code FREESHIP · Free delivery · expires 2026-09-30' },
      { id: 'SAVE20', title: 'Save 20K', meta: 'Code SAVE20 · 20,000 KRW off · expires 2026-07-15' },
    ];

    for (const coupon of expected) {
      const row = page.locator(`[data-testid="coupon-item"][data-coupon-id="${coupon.id}"]`);
      await expect(row.getByTestId('coupon-title')).toHaveText(coupon.title);
      await expect(row.getByTestId('coupon-code')).toHaveText(coupon.id);
      await expect(row).toContainText(coupon.meta);
      await expect(row.getByTestId('view-button')).toBeVisible();
      await expect(row.getByTestId('copy-button')).toBeVisible();
      await expect(row.getByTestId('apply-button')).toBeVisible();
    }
  });
});
