// spec: tests/web-plans/coupons/coupon-001/plan.agent.md
// seed: tests/web/seed.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Apply coupon', () => {
  test('Applying Welcome 10% coupon changes button label and status', async ({ page }) => {
    // 1. Navigate to http://127.0.0.1:3100/
    await page.goto('/');
    // expect: All three coupon cards show an 'Apply' button
    await expect(page.getByTestId('apply-button')).toHaveCount(3);

    // 2. Click the 'Apply' button on the 'Welcome 10%' coupon card
    const applyBtn = page.locator('[data-testid="coupon-item"][data-coupon-id="WELCOME10"]').getByTestId('apply-button');
    await applyBtn.click();
    // expect: The status region shows 'Applied WELCOME10'
    await expect(page.getByRole('status')).toHaveText('Applied WELCOME10');
    // expect: The button on the Welcome 10% card now reads 'Applied' and is styled with green background and active state (focused)
    await expect(applyBtn).toHaveText('Applied');
    await expect(applyBtn).toHaveClass(/applied/);
    await expect(applyBtn).toBeFocused();
    // expect: The Free Shipping and Save 20K cards still show 'Apply' buttons
    await expect(
      page.locator('[data-testid="coupon-item"][data-coupon-id="FREESHIP"]').getByTestId('apply-button')
    ).toHaveText('Apply');
    await expect(
      page.locator('[data-testid="coupon-item"][data-coupon-id="SAVE20"]').getByTestId('apply-button')
    ).toHaveText('Apply');
  });

  test('Applying Free Shipping coupon changes button label and status', async ({ page }) => {
    // 1. Navigate to http://127.0.0.1:3100/
    await page.goto('/');
    // expect: All three coupon cards show an 'Apply' button
    await expect(page.getByTestId('apply-button')).toHaveCount(3);

    // 2. Click the 'Apply' button on the 'Free Shipping' coupon card
    const applyBtn = page.locator('[data-testid="coupon-item"][data-coupon-id="FREESHIP"]').getByTestId('apply-button');
    await applyBtn.click();
    // expect: The status region shows 'Applied FREESHIP'
    await expect(page.getByRole('status')).toHaveText('Applied FREESHIP');
    // expect: The button on the Free Shipping card now reads 'Applied' and is styled as active (focused)
    await expect(applyBtn).toHaveText('Applied');
    await expect(applyBtn).toHaveClass(/applied/);
    await expect(applyBtn).toBeFocused();
    // expect: The Welcome 10% and Save 20K cards still show 'Apply' buttons
    await expect(
      page.locator('[data-testid="coupon-item"][data-coupon-id="WELCOME10"]').getByTestId('apply-button')
    ).toHaveText('Apply');
    await expect(
      page.locator('[data-testid="coupon-item"][data-coupon-id="SAVE20"]').getByTestId('apply-button')
    ).toHaveText('Apply');
  });

  test('Applying Save 20K coupon changes button label and status', async ({ page }) => {
    // 1. Navigate to http://127.0.0.1:3100/
    await page.goto('/');
    // expect: All three coupon cards show an 'Apply' button
    await expect(page.getByTestId('apply-button')).toHaveCount(3);

    // 2. Click the 'Apply' button on the 'Save 20K' coupon card
    const applyBtn = page.locator('[data-testid="coupon-item"][data-coupon-id="SAVE20"]').getByTestId('apply-button');
    await applyBtn.click();
    // expect: The status region shows 'Applied SAVE20'
    await expect(page.getByRole('status')).toHaveText('Applied SAVE20');
    // expect: The button on the Save 20K card now reads 'Applied' and is styled as active (focused)
    await expect(applyBtn).toHaveText('Applied');
    await expect(applyBtn).toHaveClass(/applied/);
    await expect(applyBtn).toBeFocused();
  });

  test('Applying multiple coupons in sequence accumulates applied states', async ({ page }) => {
    // 1. Navigate to http://127.0.0.1:3100/
    await page.goto('/');
    // expect: All three coupon cards show 'Apply' buttons
    await expect(page.getByTestId('apply-button')).toHaveCount(3);

    const welcome = page.locator('[data-testid="coupon-item"][data-coupon-id="WELCOME10"]').getByTestId('apply-button');
    const free = page.locator('[data-testid="coupon-item"][data-coupon-id="FREESHIP"]').getByTestId('apply-button');
    const save = page.locator('[data-testid="coupon-item"][data-coupon-id="SAVE20"]').getByTestId('apply-button');

    // 2. Click 'Apply' on the 'Welcome 10%' coupon
    await welcome.click();
    // expect: The Welcome 10% card shows 'Applied' (active/focused), status shows 'Applied WELCOME10'
    await expect(welcome).toHaveText('Applied');
    await expect(welcome).toBeFocused();
    await expect(page.getByRole('status')).toHaveText('Applied WELCOME10');

    // 3. Click 'Apply' on the 'Free Shipping' coupon
    await free.click();
    // expect: The Free Shipping card now shows 'Applied' (active/focused)
    await expect(free).toHaveText('Applied');
    await expect(free).toBeFocused();
    // expect: The Welcome 10% card still shows 'Applied' but is no longer in the active state
    await expect(welcome).toHaveText('Applied');
    await expect(welcome).not.toBeFocused();
    // expect: The status region updates to 'Applied FREESHIP'
    await expect(page.getByRole('status')).toHaveText('Applied FREESHIP');

    // 4. Click 'Apply' on the 'Save 20K' coupon
    await save.click();
    // expect: The Save 20K card shows 'Applied' (active/focused)
    await expect(save).toHaveText('Applied');
    await expect(save).toBeFocused();
    // expect: Both Welcome 10% and Free Shipping cards show 'Applied' without active state
    await expect(welcome).toHaveText('Applied');
    await expect(welcome).not.toBeFocused();
    await expect(free).toHaveText('Applied');
    await expect(free).not.toBeFocused();
    // expect: The status region shows 'Applied SAVE20'
    await expect(page.getByRole('status')).toHaveText('Applied SAVE20');
  });

  test('Clicking an already-applied coupon button makes it active again without reverting', async ({ page }) => {
    // 1. Navigate to http://127.0.0.1:3100/
    await page.goto('/');
    // expect: The coupon list is displayed
    await expect(page.getByTestId('coupon-list')).toBeVisible();

    const welcome = page.locator('[data-testid="coupon-item"][data-coupon-id="WELCOME10"]').getByTestId('apply-button');
    const free = page.locator('[data-testid="coupon-item"][data-coupon-id="FREESHIP"]').getByTestId('apply-button');

    // 2. Click 'Apply' on the 'Welcome 10%' coupon
    await welcome.click();
    // expect: Welcome 10% shows 'Applied' as active (focused)
    await expect(welcome).toHaveText('Applied');
    await expect(welcome).toBeFocused();

    // 3. Click 'Apply' on the 'Free Shipping' coupon
    await free.click();
    // expect: Free Shipping shows 'Applied' as active (focused), Welcome 10% shows 'Applied' but not active
    await expect(free).toHaveText('Applied');
    await expect(free).toBeFocused();
    await expect(welcome).toHaveText('Applied');
    await expect(welcome).not.toBeFocused();

    // 4. Click the 'Applied' button on the 'Welcome 10%' coupon
    await welcome.click();
    // expect: The status region updates to 'Applied WELCOME10'
    await expect(page.getByRole('status')).toHaveText('Applied WELCOME10');
    // expect: The Welcome 10% card's button becomes active again (focused)
    await expect(welcome).toBeFocused();
    // expect: Neither coupon reverts to 'Apply' state
    await expect(welcome).toHaveText('Applied');
    await expect(free).toHaveText('Applied');
    // expect: The Free Shipping card retains 'Applied' state but is no longer the active one
    await expect(free).not.toBeFocused();
  });
});
