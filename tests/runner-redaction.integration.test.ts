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
        redactions: [{ sourceEnv: 'DEMO_PATIENT_NAME', replacement: 'Demo Patient' }]
      }
    });
    const page = await browser.newPage();

    await installTextRedactions(page, config.privacy.redactions, { DEMO_PATIENT_NAME: 'Private Patient' });
    await page.goto('data:text/html,<main>Private Patient</main>');

    await expect.poll(() => page.locator('main').innerText()).toBe('Demo Patient');
    await page.evaluate(() => document.body.append(' — Private Patient'));
    await expect.poll(async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ')).toBe('Demo Patient — Demo Patient');
    await page.close();
  });

  test('builds a self-contained browser script for CLI execution', async () => {
    const page = await browser.newPage();
    const script = textRedactionScript([{ source: 'Private Patient', replacement: 'Demo Patient' }]);

    expect(script).not.toContain('__name');
    await page.addInitScript(script);
    await page.goto('data:text/html,<main>Private Patient</main>');

    await expect.poll(() => page.locator('main').innerText()).toBe('Demo Patient');
    await page.close();
  });
});
