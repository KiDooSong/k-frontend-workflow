import { test, expect } from '@playwright/test';

test.describe('Coupon list page', () => {
  test('Page loads with correct title and three coupon cards', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle('Coupons');
    await expect(page.getByRole('heading', { level: 1, name: 'Your Coupons' })).toBeVisible();
    await expect(page.getByTestId('status')).toHaveText('');
    await expect(page.getByTestId('coupon-item')).toHaveCount(3);

    const cards = [
      { id: 'WELCOME10', title: 'Welcome 10%', meta: 'Code WELCOME10 · 10% off · expires 2026-12-31' },
      { id: 'FREESHIP', title: 'Free Shipping', meta: 'Code FREESHIP · Free delivery · expires 2026-09-30' },
      { id: 'SAVE20', title: 'Save 20K', meta: 'Code SAVE20 · 20,000 KRW off · expires 2026-07-15' },
    ];
    for (const c of cards) {
      const row = page.locator(`[data-testid="coupon-item"][data-coupon-id="${c.id}"]`);
      await expect(row.getByRole('heading', { level: 2, name: c.title })).toBeVisible();
      await expect(row).toContainText(c.meta);
      await expect(row.getByTestId('view-button')).toBeVisible();
      await expect(row.getByTestId('copy-button')).toBeVisible();
      await expect(row.getByTestId('apply-button')).toBeVisible();
    }
  });

  test('Coupon list is visible and detail panel is hidden on initial load', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByTestId('coupon-list')).toBeVisible();
    await expect(page.getByTestId('coupon-detail')).toBeHidden();
    await expect(page.getByTestId('empty-state')).toBeHidden();
  });
});
