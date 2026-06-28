// spec: tests/web-plans/coupons/coupon-001/plan.agent.md
// seed: tests/web/seed.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Copy coupon code', () => {
  test('Copy code for Welcome 10% coupon shows correct status', async ({ page }) => {
    // 1. Navigate to http://127.0.0.1:3100/
    await page.goto('/');
    // expect: The coupon list is displayed and the status region is empty
    await expect(page.getByTestId('coupon-list')).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('');

    // 2. Click the 'Copy code' button on the 'Welcome 10%' coupon card
    const copyBtn = page.locator('[data-testid="coupon-item"][data-coupon-id="WELCOME10"]').getByTestId('copy-button');
    await copyBtn.click();
    // expect: The status region shows 'Copied WELCOME10 to clipboard'
    await expect(page.getByRole('status')).toHaveText('Copied WELCOME10 to clipboard');
    // expect: The 'Copy code' button on the Welcome 10% card gains the active state (focus)
    await expect(copyBtn).toBeFocused();
  });

  test('Copy code for Free Shipping coupon shows correct status', async ({ page }) => {
    // 1. Navigate to http://127.0.0.1:3100/
    await page.goto('/');
    // expect: The coupon list is displayed and the status region is empty
    await expect(page.getByTestId('coupon-list')).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('');

    // 2. Click the 'Copy code' button on the 'Free Shipping' coupon card
    const copyBtn = page.locator('[data-testid="coupon-item"][data-coupon-id="FREESHIP"]').getByTestId('copy-button');
    await copyBtn.click();
    // expect: The status region shows 'Copied FREESHIP to clipboard'
    await expect(page.getByRole('status')).toHaveText('Copied FREESHIP to clipboard');
    // expect: The 'Copy code' button on the Free Shipping card gains the active state (focus)
    await expect(copyBtn).toBeFocused();
  });

  test('Copy code for Save 20K coupon shows correct status', async ({ page }) => {
    // 1. Navigate to http://127.0.0.1:3100/
    await page.goto('/');
    // expect: The coupon list is displayed and the status region is empty
    await expect(page.getByTestId('coupon-list')).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('');

    // 2. Click the 'Copy code' button on the 'Save 20K' coupon card
    const copyBtn = page.locator('[data-testid="coupon-item"][data-coupon-id="SAVE20"]').getByTestId('copy-button');
    await copyBtn.click();
    // expect: The status region shows 'Copied SAVE20 to clipboard'
    await expect(page.getByRole('status')).toHaveText('Copied SAVE20 to clipboard');
    // expect: The 'Copy code' button on the Save 20K card gains the active state (focus)
    await expect(copyBtn).toBeFocused();
  });

  test('Copying a second coupon code updates the status to the new code', async ({ page }) => {
    // 1. Navigate to http://127.0.0.1:3100/
    await page.goto('/');
    // expect: The coupon list is displayed
    await expect(page.getByTestId('coupon-list')).toBeVisible();

    const welcomeCopy = page.locator('[data-testid="coupon-item"][data-coupon-id="WELCOME10"]').getByTestId('copy-button');
    const freeCopy = page.locator('[data-testid="coupon-item"][data-coupon-id="FREESHIP"]').getByTestId('copy-button');

    // 2. Click 'Copy code' on the 'Welcome 10%' coupon
    await welcomeCopy.click();
    // expect: The status region shows 'Copied WELCOME10 to clipboard'
    await expect(page.getByRole('status')).toHaveText('Copied WELCOME10 to clipboard');

    // 3. Click 'Copy code' on the 'Free Shipping' coupon
    await freeCopy.click();
    // expect: The status region now shows 'Copied FREESHIP to clipboard'
    await expect(page.getByRole('status')).toHaveText('Copied FREESHIP to clipboard');
    // expect: The 'Copy code' button on the Free Shipping card is active (focused)
    await expect(freeCopy).toBeFocused();
    // expect: The 'Copy code' button on the Welcome 10% card is no longer active
    await expect(welcomeCopy).not.toBeFocused();
  });

  test('Copying the code of an already-applied coupon still shows the copy status', async ({ page }) => {
    // 1. Navigate to http://127.0.0.1:3100/
    await page.goto('/');
    // expect: The coupon list is displayed
    await expect(page.getByTestId('coupon-list')).toBeVisible();

    const applyBtn = page.locator('[data-testid="coupon-item"][data-coupon-id="FREESHIP"]').getByTestId('apply-button');
    const copyBtn = page.locator('[data-testid="coupon-item"][data-coupon-id="FREESHIP"]').getByTestId('copy-button');

    // 2. Click 'Apply' on the 'Free Shipping' coupon
    await applyBtn.click();
    // expect: The Apply button changes to 'Applied'
    await expect(applyBtn).toHaveText('Applied');

    // 3. Click 'Copy code' on the 'Free Shipping' coupon
    await copyBtn.click();
    // expect: The status region shows 'Copied FREESHIP to clipboard'
    await expect(page.getByRole('status')).toHaveText('Copied FREESHIP to clipboard');
    // expect: The 'Copy code' button gains the active state (focus)
    await expect(copyBtn).toBeFocused();
    // expect: The Apply button still shows 'Applied'
    await expect(applyBtn).toHaveText('Applied');
  });
});
