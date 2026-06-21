import { test, expect } from '@playwright/test';

// "Good seed" (research doc 01 §b.5) — replaces the empty init-agents shell.
// Establishes the L010 signup screen as the ready-to-use page context that
// planner_setup_page / generator_setup_page hand to the agents.
// This app's nav = web deep-link query param (?screen=l010 opens L010 directly,
// home unmounted), which is an ideal deterministic entry point for the agents.
//
// (Not run by the suite — testDir is './tests'. It exists as the agent seed.)
test('seed', async ({ page }) => {
  await page.goto('/?screen=l010');
  await expect(page.getByText('회원가입')).toBeVisible();
});
