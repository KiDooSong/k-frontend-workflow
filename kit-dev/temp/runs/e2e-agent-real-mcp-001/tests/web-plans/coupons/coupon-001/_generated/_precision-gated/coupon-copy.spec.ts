import { test, expect } from '@playwright/test';

test.describe('Copy coupon code', () => {
  const cases = [
    { id: 'WELCOME10', title: 'Welcome 10%' },
    { id: 'FREESHIP', title: 'Free Shipping' },
    { id: 'SAVE20', title: 'Save 20K' },
  ];

  for (const c of cases) {
    test(`Copy code for ${c.title} coupon shows correct status`, async ({ page }) => {
      await page.goto('/');
      await expect(page.getByTestId('status')).toHaveText('');

      await page.locator(`[data-testid="coupon-item"][data-coupon-id="${c.id}"]`).getByTestId('copy-button').click();

      await expect(page.getByTestId('status')).toHaveText(`Copied ${c.id} to clipboard`);
    });
  }

  test('Copying a second coupon code updates the status to the new code', async ({ page }) => {
    await page.goto('/');

    await page.locator('[data-testid="coupon-item"][data-coupon-id="WELCOME10"]').getByTestId('copy-button').click();
    await expect(page.getByTestId('status')).toHaveText('Copied WELCOME10 to clipboard');

    await page.locator('[data-testid="coupon-item"][data-coupon-id="FREESHIP"]').getByTestId('copy-button').click();
    await expect(page.getByTestId('status')).toHaveText('Copied FREESHIP to clipboard');
  });

  test('Copying the code of an already-applied coupon still shows the copy status', async ({ page }) => {
    await page.goto('/');
    const applyBtn = page.locator('[data-testid="coupon-item"][data-coupon-id="FREESHIP"]').getByTestId('apply-button');

    await applyBtn.click();
    await expect(applyBtn).toHaveText('Applied');

    await page.locator('[data-testid="coupon-item"][data-coupon-id="FREESHIP"]').getByTestId('copy-button').click();
    await expect(page.getByTestId('status')).toHaveText('Copied FREESHIP to clipboard');
    await expect(applyBtn).toHaveText('Applied');
  });
});
