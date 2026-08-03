import { chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Browser } from 'playwright';
import { installTextRedactions, textRedactionScript } from '../src/runner.js';
import { ConfigSchema } from '../src/schemas.js';

describe('capture privacy redactions', () => {
  let browser: Browser;

  beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
  afterAll(async () => { await browser.close(); });

  test('replaces configured DOM text before capture and on later mutations', async () => {
    const config = ConfigSchema.parse({
      app: { url: 'http://127.0.0.1:3005' },
      privacy: {
        redactions: [{ sourceEnv: 'DEMO_ACCOUNT_NAME', replacement: 'Demo Account' }]
      }
    });
    const page = await browser.newPage();

    await installTextRedactions(page, config.privacy.redactions, { DEMO_ACCOUNT_NAME: 'Private Account' });
    await page.goto('data:text/html,<main>Private Account</main>');

    await expect.poll(() => page.locator('main').innerText()).toBe('Demo Account');
    await page.evaluate(() => document.body.append(' — Private Account'));
    await expect.poll(async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ')).toBe('Demo Account — Demo Account');
    await page.close();
  });

  test('builds a self-contained browser script for CLI execution', async () => {
    const page = await browser.newPage();
    const script = textRedactionScript([{ source: 'Private Account', replacement: 'Demo Account' }]);

    expect(script).not.toContain('__name');
    await page.addInitScript(script);
    await page.goto('data:text/html,<main>Private Account</main>');

    await expect.poll(() => page.locator('main').innerText()).toBe('Demo Account');
    await page.close();
  });
});
