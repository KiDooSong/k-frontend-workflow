// spec: tests/web-plans/coupons/coupon-001/plan.agent.md
// seed: tests/web/seed.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Coupon list page', () => {
  test('Page loads with correct title and three coupon cards', async ({ page }) => {
    // 1. Navigate to http://127.0.0.1:3100/
    await page.goto('/');
    // expect: The page title in the browser tab reads 'Coupons'
    await expect(page).toHaveTitle('Coupons');
    // expect: A level-1 heading 'Your Coupons' is visible on the page
    await expect(page.getByRole('heading', { level: 1, name: 'Your Coupons' })).toBeVisible();
    // expect: The status region (role=status) is present and empty
    await expect(page.getByRole('status')).toHaveText('');
    // expect: The coupon list contains exactly three list items
    await expect(page.getByTestId('coupon-item')).toHaveCount(3);

    // 2. Inspect the first coupon card
    const welcome = page.locator('[data-testid="coupon-item"][data-coupon-id="WELCOME10"]');
    // expect: A level-2 heading 'Welcome 10%' is visible
    await expect(welcome.getByRole('heading', { level: 2, name: 'Welcome 10%' })).toBeVisible();
    // expect: The metadata line reads 'Code WELCOME10 · 10% off · expires 2026-12-31'
    await expect(welcome).toContainText('Code WELCOME10 · 10% off · expires 2026-12-31');
    // expect: Three buttons labelled 'View', 'Copy code', and 'Apply' are present on the card
    await expect(welcome.getByRole('button', { name: 'View' })).toBeVisible();
    await expect(welcome.getByRole('button', { name: 'Copy code' })).toBeVisible();
    await expect(welcome.getByRole('button', { name: 'Apply' })).toBeVisible();

    // 3. Inspect the second coupon card
    const free = page.locator('[data-testid="coupon-item"][data-coupon-id="FREESHIP"]');
    // expect: A level-2 heading 'Free Shipping' is visible
    await expect(free.getByRole('heading', { level: 2, name: 'Free Shipping' })).toBeVisible();
    // expect: The metadata line reads 'Code FREESHIP · Free delivery · expires 2026-09-30'
    await expect(free).toContainText('Code FREESHIP · Free delivery · expires 2026-09-30');
    // expect: Three buttons labelled 'View', 'Copy code', and 'Apply' are present on the card
    await expect(free.getByRole('button', { name: 'View' })).toBeVisible();
    await expect(free.getByRole('button', { name: 'Copy code' })).toBeVisible();
    await expect(free.getByRole('button', { name: 'Apply' })).toBeVisible();

    // 4. Inspect the third coupon card
    const save = page.locator('[data-testid="coupon-item"][data-coupon-id="SAVE20"]');
    // expect: A level-2 heading 'Save 20K' is visible
    await expect(save.getByRole('heading', { level: 2, name: 'Save 20K' })).toBeVisible();
    // expect: The metadata line reads 'Code SAVE20 · 20,000 KRW off · expires 2026-07-15'
    await expect(save).toContainText('Code SAVE20 · 20,000 KRW off · expires 2026-07-15');
    // expect: Three buttons labelled 'View', 'Copy code', and 'Apply' are present on the card
    await expect(save.getByRole('button', { name: 'View' })).toBeVisible();
    await expect(save.getByRole('button', { name: 'Copy code' })).toBeVisible();
    await expect(save.getByRole('button', { name: 'Apply' })).toBeVisible();
  });

  test('Coupon list is visible and detail panel is hidden on initial load', async ({ page }) => {
    // 1. Navigate to http://127.0.0.1:3100/
    await page.goto('/');
    // expect: The coupon list element (data-testid=coupon-list) is visible
    await expect(page.getByTestId('coupon-list')).toBeVisible();
    // expect: The detail panel (data-testid=coupon-detail) is not visible (hidden attribute is set)
    await expect(page.getByTestId('coupon-detail')).toBeHidden();
    // expect: The empty-state element (data-testid=empty-state) is not visible
    await expect(page.getByTestId('empty-state')).toBeHidden();
  });
});
