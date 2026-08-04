import { chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Browser } from 'playwright';
import { executeAction, installTextRedactions, isIgnorableRequestFailure, isIgnoredConsoleError, isIgnoredRequest, locatorFor, textRedactionScript } from '../src/runner.js';
import { ConfigSchema, TargetSchema } from '../src/schemas.js';

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

  test('replaces configured text inside initial and dynamically mounted form values', async () => {
    const page = await browser.newPage();
    const script = textRedactionScript([{ source: 'Private Account', replacement: 'Demo Account' }]);

    await page.addInitScript(script);
    await page.goto('data:text/html,<input aria-label="Patient" value="Private Account"><textarea aria-label="Summary">Private Account</textarea>');

    await expect.poll(() => page.getByLabel('Patient').inputValue()).toBe('Demo Account');
    await expect.poll(() => page.getByLabel('Summary').inputValue()).toBe('Demo Account');
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.setAttribute('aria-label', 'Doctor');
      input.value = 'Private Account';
      document.body.append(input);
    });
    await expect.poll(() => page.getByLabel('Doctor').inputValue()).toBe('Demo Account');
    await page.evaluate(() => setTimeout(() => document.body.append('Ready'), 0));
    await expect.poll(() => page.getByText('Ready').isVisible()).toBe(true);
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

  test('targets the latest semantic role match when prior controls remain mounted', async () => {
    const page = await browser.newPage();
    await page.setContent('<button disabled>I feel nauseated</button><button>I feel nauseated but can continue</button>');

    const locator = locatorFor(page, { by: 'rolePattern', role: 'button', pattern: '^I feel nauseated' });

    expect(await locator.isEnabled()).toBe(true);
    await page.close();
  });

  test('continues when an optional target does not appear', async () => {
    const page = await browser.newPage();
    await page.setContent('<main>Complete</main><button disabled>Optional choice</button>');

    await expect(executeAction(page, {
      type: 'click',
      target: { by: 'rolePattern', role: 'button', pattern: '^Optional choice$' },
      optional: true,
      timeoutMs: 25
    })).resolves.toEqual({ cursor: { x: 40, y: 40 } });
    await page.close();
  });

  test('fails a required target using the configured action timeout', async () => {
    const page = await browser.newPage();
    await page.setContent('<main>Complete</main>');
    const started = Date.now();

    await expect(executeAction(page, { type: 'click', target: { by: 'text', value: 'Never appears' } }, false, undefined, undefined, 300)).rejects.toThrow();

    expect(Date.now() - started).toBeLessThan(5_000);
    await page.close();
  });

  test('targets text across allowed copy variants', async () => {
    const page = await browser.newPage();
    await page.setContent('<p>I will share all of this with your doctor.</p>');
    const target = TargetSchema.parse({ by: 'textPattern', pattern: 'summary was updated|share all of this' });

    expect(await locatorFor(page, target).isVisible()).toBe(true);
    await page.close();
  });

  test('ignores only the request URLs the configuration allows', () => {
    const patterns = ['/api/telemetry', '\\.well-known/'];

    expect(isIgnoredRequest('http://app.test/api/telemetry?id=3', patterns)).toBe(true);
    expect(isIgnoredRequest('http://app.test/.well-known/probe', patterns)).toBe(true);
    expect(isIgnoredRequest('http://app.test/api/orders', patterns)).toBe(false);
    expect(isIgnoredRequest('http://app.test/api/telemetry', [])).toBe(false);
  });

  test('ignores only the console messages the configuration allows', () => {
    const patterns = ['Vector Map', '^ResizeObserver loop'];

    expect(isIgnoredConsoleError('Attempted to load a Vector Map, but failed. Falling back to Raster', patterns)).toBe(true);
    expect(isIgnoredConsoleError('ResizeObserver loop completed with undelivered notifications', patterns)).toBe(true);
    expect(isIgnoredConsoleError('TypeError: cannot read property id of undefined', patterns)).toBe(false);
    expect(isIgnoredConsoleError('Attempted to load a Vector Map', [])).toBe(false);
  });

  test('ignores browser-aborted requests but keeps real network failures', () => {
    expect(isIgnorableRequestFailure('net::ERR_ABORTED')).toBe(true);
    expect(isIgnorableRequestFailure('net::ERR_CONNECTION_REFUSED')).toBe(false);
    expect(isIgnorableRequestFailure(undefined)).toBe(false);
  });
});
