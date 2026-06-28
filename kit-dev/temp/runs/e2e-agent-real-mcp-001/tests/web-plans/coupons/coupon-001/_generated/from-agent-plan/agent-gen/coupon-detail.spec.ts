// spec: tests/web-plans/coupons/coupon-001/plan.agent.md
// seed: tests/web/seed.spec.ts

import { test, expect } from '@playwright/test';

test.describe('View coupon detail', () => {
  test('View Welcome 10% coupon detail and return to list', async ({ page }) => {
    // 1. Navigate to http://127.0.0.1:3100/
    await page.goto('/');
    // expect: The coupon list is displayed with three items
    await expect(page.getByTestId('coupon-item')).toHaveCount(3);

    // 2. Click the 'View' button on the 'Welcome 10%' coupon card
    await page.locator('[data-testid="coupon-item"][data-coupon-id="WELCOME10"]').getByTestId('view-button').click();
    // expect: The coupon list is hidden
    await expect(page.getByTestId('coupon-list')).toBeHidden();
    // expect: The detail panel is visible
    await expect(page.getByTestId('coupon-detail')).toBeVisible();
    // expect: The detail panel shows a level-2 heading 'Welcome 10%'
    await expect(page.getByTestId('detail-title')).toHaveText('Welcome 10%');
    // expect: The detail panel shows the meta line 'Code WELCOME10 · 10% off · expires 2026-12-31'
    await expect(page.getByTestId('detail-meta')).toHaveText('Code WELCOME10 · 10% off · expires 2026-12-31');
    // expect: The detail panel shows the description 'First order discount for new members.'
    await expect(page.getByTestId('detail-desc')).toHaveText('First order discount for new members.');
    // expect: A '← Back' button is present in the detail panel
    await expect(page.getByTestId('detail-back')).toBeVisible();
    // expect: The status region is empty (clicking View clears any previous status)
    await expect(page.getByRole('status')).toHaveText('');

    // 3. Click the '← Back' button
    await page.getByTestId('detail-back').click();
    // expect: The detail panel is hidden
    await expect(page.getByTestId('coupon-detail')).toBeHidden();
    // expect: The coupon list is visible again with all three coupon cards
    await expect(page.getByTestId('coupon-list')).toBeVisible();
    await expect(page.getByTestId('coupon-item')).toHaveCount(3);
  });

  test('View Free Shipping coupon detail', async ({ page }) => {
    // 1. Navigate to http://127.0.0.1:3100/
    await page.goto('/');
    // expect: The coupon list is displayed
    await expect(page.getByTestId('coupon-list')).toBeVisible();

    // 2. Click the 'View' button on the 'Free Shipping' coupon card
    await page.locator('[data-testid="coupon-item"][data-coupon-id="FREESHIP"]').getByTestId('view-button').click();
    // expect: The detail panel becomes visible
    await expect(page.getByTestId('coupon-detail')).toBeVisible();
    // expect: The level-2 heading reads 'Free Shipping'
    await expect(page.getByTestId('detail-title')).toHaveText('Free Shipping');
    // expect: The meta line reads 'Code FREESHIP · Free delivery · expires 2026-09-30'
    await expect(page.getByTestId('detail-meta')).toHaveText('Code FREESHIP · Free delivery · expires 2026-09-30');
    // expect: The description reads 'No minimum spend on standard delivery.'
    await expect(page.getByTestId('detail-desc')).toHaveText('No minimum spend on standard delivery.');
  });

  test('View Save 20K coupon detail', async ({ page }) => {
    // 1. Navigate to http://127.0.0.1:3100/
    await page.goto('/');
    // expect: The coupon list is displayed
    await expect(page.getByTestId('coupon-list')).toBeVisible();

    // 2. Click the 'View' button on the 'Save 20K' coupon card
    await page.locator('[data-testid="coupon-item"][data-coupon-id="SAVE20"]').getByTestId('view-button').click();
    // expect: The detail panel becomes visible
    await expect(page.getByTestId('coupon-detail')).toBeVisible();
    // expect: The level-2 heading reads 'Save 20K'
    await expect(page.getByTestId('detail-title')).toHaveText('Save 20K');
    // expect: The meta line reads 'Code SAVE20 · 20,000 KRW off · expires 2026-07-15'
    await expect(page.getByTestId('detail-meta')).toHaveText('Code SAVE20 · 20,000 KRW off · expires 2026-07-15');
    // expect: The description reads 'Orders over 100,000 KRW.'
    await expect(page.getByTestId('detail-desc')).toHaveText('Orders over 100,000 KRW.');
  });

  test('Viewing a coupon detail clears the status region', async ({ page }) => {
    // 1. Navigate to http://127.0.0.1:3100/
    await page.goto('/');
    // expect: The coupon list is displayed
    await expect(page.getByTestId('coupon-list')).toBeVisible();

    // 2. Click 'Copy code' on the 'Welcome 10%' coupon to produce a status message
    await page.locator('[data-testid="coupon-item"][data-coupon-id="WELCOME10"]').getByTestId('copy-button').click();
    // expect: The status region shows 'Copied WELCOME10 to clipboard'
    await expect(page.getByRole('status')).toHaveText('Copied WELCOME10 to clipboard');

    // 3. Click the 'View' button on the 'Welcome 10%' coupon
    await page.locator('[data-testid="coupon-item"][data-coupon-id="WELCOME10"]').getByTestId('view-button').click();
    // expect: The detail panel is shown
    await expect(page.getByTestId('coupon-detail')).toBeVisible();
    // expect: The status region is now empty (the status message has been cleared)
    await expect(page.getByRole('status')).toHaveText('');
  });

  test('Returning from detail view resets all applied coupon states', async ({ page }) => {
    // 1. Navigate to http://127.0.0.1:3100/
    await page.goto('/');
    // expect: The coupon list is displayed
    await expect(page.getByTestId('coupon-list')).toBeVisible();

    // 2. Click 'Apply' on the 'Welcome 10%' coupon
    const welcomeApply = page.locator('[data-testid="coupon-item"][data-coupon-id="WELCOME10"]').getByTestId('apply-button');
    await welcomeApply.click();
    // expect: The Apply button changes to 'Applied' and is styled as active (green)
    await expect(welcomeApply).toHaveText('Applied');
    await expect(welcomeApply).toHaveClass(/applied/);

    // 3. Click 'View' on the 'Free Shipping' coupon to navigate to the detail view
    await page.locator('[data-testid="coupon-item"][data-coupon-id="FREESHIP"]').getByTestId('view-button').click();
    // expect: The detail panel for Free Shipping is shown
    await expect(page.getByTestId('coupon-detail')).toBeVisible();
    await expect(page.getByTestId('detail-title')).toHaveText('Free Shipping');

    // 4. Click '← Back' to return to the list
    await page.getByTestId('detail-back').click();
    // expect: The coupon list is visible with all three cards
    await expect(page.getByTestId('coupon-list')).toBeVisible();
    await expect(page.getByTestId('coupon-item')).toHaveCount(3);
    // expect: The 'Welcome 10%' card's button now shows 'Apply' again (applied state was lost when the list was re-rendered)
    await expect(
      page.locator('[data-testid="coupon-item"][data-coupon-id="WELCOME10"]').getByTestId('apply-button')
    ).toHaveText('Apply');
  });
});
