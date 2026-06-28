import { test, expect } from '@playwright/test';

test.describe('Apply coupon', () => {
  const cases = [
    { id: 'WELCOME10', title: 'Welcome 10%', others: ['FREESHIP', 'SAVE20'] },
    { id: 'FREESHIP', title: 'Free Shipping', others: ['WELCOME10', 'SAVE20'] },
    { id: 'SAVE20', title: 'Save 20K', others: ['WELCOME10', 'FREESHIP'] },
  ];

  for (const c of cases) {
    test(`Applying ${c.title} coupon changes button label and status`, async ({ page }) => {
      await page.goto('/');
      const applyBtn = page.locator(`[data-coupon-id="${c.id}"]`).getByTestId('apply-button');
      await applyBtn.click();

      await expect(page.getByTestId('status')).toHaveText(`Applied ${c.id}`);
      await expect(applyBtn).toHaveText('Applied');
      await expect(applyBtn).toHaveClass(/applied/);
      for (const other of c.others) {
        await expect(page.locator(`[data-coupon-id="${other}"]`).getByTestId('apply-button')).toHaveText('Apply');
      }
    });
  }

  test('Applying multiple coupons in sequence accumulates applied states', async ({ page }) => {
    await page.goto('/');
    const welcome = page.locator('[data-coupon-id="WELCOME10"]').getByTestId('apply-button');
    const free = page.locator('[data-coupon-id="FREESHIP"]').getByTestId('apply-button');
    const save = page.locator('[data-coupon-id="SAVE20"]').getByTestId('apply-button');

    await welcome.click();
    await expect(welcome).toHaveText('Applied');
    await expect(page.getByTestId('status')).toHaveText('Applied WELCOME10');

    await free.click();
    await expect(free).toHaveText('Applied');
    await expect(welcome).toHaveText('Applied');
    await expect(welcome).not.toBeFocused();
    await expect(page.getByTestId('status')).toHaveText('Applied FREESHIP');

    await save.click();
    await expect(save).toHaveText('Applied');
    await expect(welcome).toHaveText('Applied');
    await expect(free).toHaveText('Applied');
    await expect(page.getByTestId('status')).toHaveText('Applied SAVE20');
  });

  test('Clicking an already-applied coupon button makes it active again without reverting', async ({ page }) => {
    await page.goto('/');
    const welcome = page.locator('[data-coupon-id="WELCOME10"]').getByTestId('apply-button');
    const free = page.locator('[data-coupon-id="FREESHIP"]').getByTestId('apply-button');

    await welcome.click();
    await expect(welcome).toHaveText('Applied');
    await expect(welcome).toBeFocused();

    await free.click();
    await expect(free).toHaveText('Applied');
    await expect(free).toBeFocused();
    await expect(welcome).toHaveText('Applied');
    await expect(welcome).not.toBeFocused();

    await welcome.click();
    await expect(page.getByTestId('status')).toHaveText('Applied WELCOME10');
    await expect(welcome).toBeFocused();
    await expect(welcome).toHaveText('Applied');
    await expect(free).toHaveText('Applied');
    await expect(free).not.toBeFocused();
  });
});
