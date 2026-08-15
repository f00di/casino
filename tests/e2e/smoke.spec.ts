import { expect, test } from '@playwright/test';

test('landing page is responsive and carries the play-money disclaimer', async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 768, height: 900 }, { width: 390, height: 844 }, { width: 375, height: 812 }]) {
    await page.setViewportSize(viewport); await page.goto('/');
    await expect(page.getByRole('heading', { name: /Cards with friends/i })).toBeVisible();
    await expect(page.getByText('Play-money only — no cash value.').filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText('Texas Hold’em Poker')).toBeVisible();
    await expect(page.getByText('Multiplayer Blackjack')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
