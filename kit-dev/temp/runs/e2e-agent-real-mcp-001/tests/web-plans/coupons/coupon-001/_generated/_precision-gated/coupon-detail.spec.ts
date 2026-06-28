import { test, expect } from '@playwright/test';

test.describe('View coupon detail', () => {
  test('View Welcome 10% coupon detail and return to list', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('coupon-item')).toHaveCount(3);

    await page.locator('[data-testid="coupon-item"][data-coupon-id="WELCOME10"]').getByTestId('view-button').click();

    await expect(page.getByTestId('coupon-list')).toBeHidden();
    await expect(page.getByTestId('coupon-detail')).toBeVisible();
    await expect(page.getByTestId('detail-title')).toHaveText('Welcome 10%');
    await expect(page.getByTestId('detail-meta')).toHaveText('Code WELCOME10 · 10% off · expires 2026-12-31');
    await expect(page.getByTestId('detail-desc')).toHaveText('First order discount for new members.');
    await expect(page.getByTestId('detail-back')).toBeVisible();
    await expect(page.getByTestId('status')).toHaveText('');

    await page.getByTestId('detail-back').click();
    await expect(page.getByTestId('coupon-detail')).toBeHidden();
    await expect(page.getByTestId('coupon-list')).toBeVisible();
    await expect(page.getByTestId('coupon-item')).toHaveCount(3);
  });

  test('View Free Shipping coupon detail', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-testid="coupon-item"][data-coupon-id="FREESHIP"]').getByTestId('view-button').click();

    await expect(page.getByTestId('coupon-detail')).toBeVisible();
    await expect(page.getByTestId('detail-title')).toHaveText('Free Shipping');
    await expect(page.getByTestId('detail-meta')).toHaveText('Code FREESHIP · Free delivery · expires 2026-09-30');
    await expect(page.getByTestId('detail-desc')).toHaveText('No minimum spend on standard delivery.');
  });

  test('View Save 20K coupon detail', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-testid="coupon-item"][data-coupon-id="SAVE20"]').getByTestId('view-button').click();

    await expect(page.getByTestId('coupon-detail')).toBeVisible();
    await expect(page.getByTestId('detail-title')).toHaveText('Save 20K');
    await expect(page.getByTestId('detail-meta')).toHaveText('Code SAVE20 · 20,000 KRW off · expires 2026-07-15');
    await expect(page.getByTestId('detail-desc')).toHaveText('Orders over 100,000 KRW.');
  });

  test('Viewing a coupon detail clears the status region', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-testid="coupon-item"][data-coupon-id="WELCOME10"]').getByTestId('copy-button').click();
    await expect(page.getByTestId('status')).toHaveText('Copied WELCOME10 to clipboard');

    await page.locator('[data-testid="coupon-item"][data-coupon-id="WELCOME10"]').getByTestId('view-button').click();
    await expect(page.getByTestId('coupon-detail')).toBeVisible();
    await expect(page.getByTestId('status')).toHaveText('');
  });

  test('Returning from detail view resets all applied coupon states', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-testid="coupon-item"][data-coupon-id="WELCOME10"]').getByTestId('apply-button').click();
    await expect(page.locator('[data-testid="coupon-item"][data-coupon-id="WELCOME10"]').getByTestId('apply-button')).toHaveText('Applied');

    await page.locator('[data-testid="coupon-item"][data-coupon-id="FREESHIP"]').getByTestId('view-button').click();
    await expect(page.getByTestId('coupon-detail')).toBeVisible();

    await page.getByTestId('detail-back').click();
    await expect(page.getByTestId('coupon-list')).toBeVisible();
    await expect(page.locator('[data-testid="coupon-item"][data-coupon-id="WELCOME10"]').getByTestId('apply-button')).toHaveText('Apply');
  });
});
