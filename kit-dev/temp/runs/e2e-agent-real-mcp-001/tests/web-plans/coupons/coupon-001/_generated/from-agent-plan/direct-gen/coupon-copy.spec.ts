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

      const copyBtn = page.locator(`[data-coupon-id="${c.id}"]`).getByTestId('copy-button');
      await copyBtn.click();

      await expect(page.getByTestId('status')).toHaveText(`Copied ${c.id} to clipboard`);
      await expect(copyBtn).toBeFocused();
    });
  }

  test('Copying a second coupon code updates the status to the new code', async ({ page }) => {
    await page.goto('/');
    const welcomeCopy = page.locator('[data-coupon-id="WELCOME10"]').getByTestId('copy-button');
    const freeCopy = page.locator('[data-coupon-id="FREESHIP"]').getByTestId('copy-button');

    await welcomeCopy.click();
    await expect(page.getByTestId('status')).toHaveText('Copied WELCOME10 to clipboard');

    await freeCopy.click();
    await expect(page.getByTestId('status')).toHaveText('Copied FREESHIP to clipboard');
    await expect(freeCopy).toBeFocused();
    await expect(welcomeCopy).not.toBeFocused();
  });

  test('Copying the code of an already-applied coupon still shows the copy status', async ({ page }) => {
    await page.goto('/');
    const applyBtn = page.locator('[data-coupon-id="FREESHIP"]').getByTestId('apply-button');
    const copyBtn = page.locator('[data-coupon-id="FREESHIP"]').getByTestId('copy-button');

    await applyBtn.click();
    await expect(applyBtn).toHaveText('Applied');

    await copyBtn.click();
    await expect(page.getByTestId('status')).toHaveText('Copied FREESHIP to clipboard');
    await expect(copyBtn).toBeFocused();
    await expect(applyBtn).toHaveText('Applied');
  });
});
