import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { startShop } from './shop';

const EXT = resolve(import.meta.dirname, '../.output/chrome-mv3-e2e');

let ctx: BrowserContext;
let shop: Awaited<ReturnType<typeof startShop>>;
let extId = '';

test.beforeAll(async () => {
  shop = await startShop();
  shop.url = shop.url.replace('127.0.0.1', 'shop.test');
  ctx = await chromium.launchPersistentContext(mkdtempSync(resolve(tmpdir(), 'sv-')), {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, `--host-resolver-rules=MAP shop.test 127.0.0.1`],
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  extId = new URL(sw.url()).host;
});

test.afterAll(async () => {
  await ctx?.close();
  shop?.server.close();
});

async function checkPage(path: string): Promise<Page> {
  const tab = await ctx.newPage();
  await tab.goto(shop.url + path);
  const sw = ctx.serviceWorkers()[0]!;
  const tabId = await sw.evaluate(async (u) => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((t) => t.url === u)?.id ?? -1;
  }, shop.url + path);
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html?tabId=${tabId}`);
  await popup.locator('[data-state]:not([data-state="checking"])').first().waitFor();
  return popup;
}

test('catches a signed-in shopper paying more', async () => {
  const login = await ctx.newPage();
  await login.goto(shop.url + '/login');
  const popup = await checkPage('/product');
  await expect(popup.locator('[data-state="more"]')).toBeVisible();
  await expect(popup.locator('.hero')).toHaveText('+11.2%');
  await expect(popup.getByText('$10.00')).toBeVisible();
  await expect(popup.getByText('$8.99')).toBeVisible();
});

test('fair price shows a check', async () => {
  const popup = await checkPage('/fair');
  await expect(popup.locator('[data-state="fair"]')).toBeVisible();
});

test('prices moving for everyone are called out, not blamed on you', async () => {
  const popup = await checkPage('/moving');
  await expect(popup.locator('[data-state="shifting"]')).toBeVisible();
});

test('a page that is not a product', async () => {
  const popup = await checkPage('/');
  await expect(popup.getByText("This doesn't look like a product page")).toBeVisible();
});

test('the New York warning is highlighted', async () => {
  const popup = await checkPage('/notice');
  await expect(popup.getByText('This page admits it')).toBeVisible();
});

test('picking a state shows its law and remembers it', async () => {
  const popup = await checkPage('/fair');
  await popup.getByLabel('Your state').selectOption('MD');
  await expect(popup.getByText('Banned on groceries')).toBeVisible();
  await popup.reload();
  await expect(popup.getByLabel('Your state')).toHaveValue('MD');
});
