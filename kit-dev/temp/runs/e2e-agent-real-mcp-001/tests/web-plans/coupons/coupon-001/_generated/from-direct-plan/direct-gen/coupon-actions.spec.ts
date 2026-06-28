import { test, expect } from '@playwright/test';

test.describe('Coupon actions', () => {
  test('should copy a coupon code and confirm in the status line', async ({ page }) => {
    await page.goto('/');

    await page.locator('[data-coupon-id="FREESHIP"]').getByTestId('copy-button').click();

    await expect(page.getByTestId('status')).toHaveText('Copied FREESHIP to clipboard');
  });

  test('should apply a coupon and reflect the applied state', async ({ page }) => {
    await page.goto('/');

    const applyButton = page.locator('[data-coupon-id="SAVE20"]').getByTestId('apply-button');
    await applyButton.click();

    await expect(applyButton).toHaveText('Applied');
    await expect(applyButton).toHaveClass(/applied/);
    await expect(page.getByTestId('status')).toHaveText('Applied SAVE20');
  });
});
