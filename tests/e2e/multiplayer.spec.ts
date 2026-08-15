import { expect, test, type BrowserContext, type Page } from '@playwright/test';

async function createPoker(page: Page, expected = 2): Promise<string> {
  await page.goto('/#/create/poker');
  await page.getByLabel('Your display name').fill('Alex');
  await page.getByLabel('Expected players').fill(String(expected));
  await page.getByRole('button', { name: 'Create private room' }).click();
  await expect(page.getByText('Waiting for the table')).toBeVisible();
  return (await page.locator('.font-mono').first().textContent())?.trim() ?? '';
}

async function join(page: Page, roomCode: string, name: string): Promise<void> {
  await page.goto(`/#/join?room=${roomCode}`);
  await page.getByLabel('Your display name').fill(name);
  await page.getByRole('button', { name: 'Join room' }).click();
  await expect(page.getByText('Waiting for the table')).toBeVisible();
}

async function readyAndStart(host: Page, guests: Page[]): Promise<void> {
  for (const guest of guests) await guest.getByRole('button', { name: 'I’m ready' }).click();
  await host.getByRole('button', { name: 'I’m ready' }).click();
  await expect(host.getByRole('button', { name: 'Start game' })).toBeEnabled();
  await host.getByRole('button', { name: 'Start game' }).click();
}

test('two independent poker players receive private views and reconnect after refresh', async ({ browser }) => {
  const hostContext = await browser.newContext(); const guestContext = await browser.newContext();
  const host = await hostContext.newPage(); const guest = await guestContext.newPage();
  try {
    const code = await createPoker(host); await join(guest, code, 'Blair'); await readyAndStart(host, [guest]);
    await expect(host.getByLabel(/of (clubs|diamonds|hearts|spades)/u).first()).toBeVisible();
    await expect(guest.getByLabel(/of (clubs|diamonds|hearts|spades)/u).first()).toBeVisible();
    expect(await host.getByLabel('Hidden card').count()).toBeGreaterThanOrEqual(2);
    await host.setViewportSize({ width: 390, height: 844 });
    await expect(host.locator('.action-bar')).toBeVisible();
    expect(await host.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const acting = await host.getByRole('button', { name: 'Fold' }).isVisible() ? host : guest;
    await acting.getByRole('button', { name: 'Fold' }).click();
    await expect(host.getByText('Hand 2')).toBeVisible();
    await guest.reload();
    await expect(guest.getByText('Successfully reconnected.')).toBeVisible();
    await expect(guest.getByText('Hand 2')).toBeVisible();
  } finally { await hostContext.close(); await guestContext.close(); }
});

test('two blackjack players can wager, act, settle, and reconnect', async ({ browser }) => {
  const hostContext: BrowserContext = await browser.newContext(); const guestContext: BrowserContext = await browser.newContext();
  const host = await hostContext.newPage(); const guest = await guestContext.newPage();
  try {
    await host.goto('/#/create/blackjack'); await host.getByLabel('Your display name').fill('Dana'); await host.getByLabel('Expected players').fill('2');
    await host.getByRole('button', { name: 'Create private room' }).click();
    const code = (await host.locator('.font-mono').first().textContent())?.trim() ?? '';
    await join(guest, code, 'Elliot'); await readyAndStart(host, [guest]);
    for (const page of [host, guest]) await page.getByRole('button', { name: 'Deal me in' }).click();
    for (let index = 0; index < 12; index += 1) {
      for (const page of [host, guest]) {
        const decline = page.getByRole('button', { name: 'Decline' }); if (await decline.isVisible()) await decline.click();
        const stand = page.getByRole('button', { name: 'stand' }); if (await stand.isVisible()) await stand.click();
      }
      if (await host.getByText('Round complete.').isVisible()) break;
    }
    await expect(host.getByText('Round complete.')).toBeVisible();
    await host.setViewportSize({ width: 375, height: 812 });
    await expect(host.getByText('Dealer · final hand')).toBeVisible();
    expect(await host.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await guest.reload(); await expect(guest.getByText('Successfully reconnected.')).toBeVisible();
    await expect(guest.getByText(/Round 1/u)).toBeVisible();
  } finally { await hostContext.close(); await guestContext.close(); }
});
