import { test, expect } from '@playwright/test';

test.describe('Coupon detail', () => {
  test('should open the detail view for a coupon', async ({ page }) => {
    await page.goto('/');

    await page.locator('[data-coupon-id="WELCOME10"]').getByTestId('view-button').click();

    await expect(page.getByTestId('coupon-list')).toBeHidden();
    await expect(page.getByTestId('coupon-detail')).toBeVisible();
    await expect(page.getByTestId('detail-title')).toHaveText('Welcome 10%');
    await expect(page.getByTestId('detail-meta')).toHaveText('Code WELCOME10 · 10% off · expires 2026-12-31');
    await expect(page.getByTestId('detail-desc')).toHaveText('First order discount for new members.');
  });

  test('should return to the list from the detail view', async ({ page }) => {
    await page.goto('/');

    await page.locator('[data-coupon-id="WELCOME10"]').getByTestId('view-button').click();
    await expect(page.getByTestId('coupon-detail')).toBeVisible();

    await page.getByTestId('detail-back').click();

    await expect(page.getByTestId('coupon-detail')).toBeHidden();
    await expect(page.getByTestId('coupon-list')).toBeVisible();
    await expect(page.getByTestId('coupon-item')).toHaveCount(3);
  });
});
