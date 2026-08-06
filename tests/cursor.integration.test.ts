import { execFileSync } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';
import { installCapturedCursor } from '../src/runner.js';

describe('recording cursor', () => {
  it('shows a text-free neutral cursor without a click ring', async () => {
    const fixture = '<!doctype html><html><body><main><button>Continue</button></main></body></html>';
    const server = createServer((_request, response) => response.end(fixture));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP server');
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 400, height: 300 } });
      await context.tracing.start({ screenshots: false, snapshots: true, sources: true });
      const page = await context.newPage();
      await installCapturedCursor(page, '#116b5a');
      const directory = await mkdtemp(join(tmpdir(), 'demoloop-cursor-'));
      await page.screencast.start({ path: join(directory, 'cursor.webm'), size: { width: 400, height: 300 } });
      await page.screencast.showChapter('Scene', { duration: 1_200 });
      await page.screencast.showOverlay('<div>Brand</div>', { duration: 1_200 });
      await page.goto(`http://127.0.0.1:${address.port}`);
      await page.mouse.move(200, 150, { steps: 4 });
      const screenshot = join(directory, 'cursor.png');
      await page.screenshot({ path: screenshot });
      await page.screencast.stop();
      const cursor = page.locator('[data-demoloop-cursor]');
      const state = await cursor.evaluate((element) => {
        const style = getComputedStyle(element);
        return { text: element.textContent, transform: style.transform, background: style.backgroundColor, borderRadius: style.borderRadius, boxShadow: style.boxShadow };
      });
      expect(state.text).toBe('');
      expect(state.transform).not.toBe('none');
      expect(state.borderRadius).toBe('0px');
      expect(state.boxShadow).not.toContain('255, 0, 0');
      const pixels = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', screenshot, '-vf', 'crop=50:50:195:145', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { encoding: 'buffer' });
      let outlinedPixels = 0;
      for (let index = 0; index < pixels.length; index += 3) {
        if (pixels[index] < 100 && pixels[index + 1] < 130 && pixels[index + 2] < 130) outlinedPixels += 1;
      }
      expect(outlinedPixels).toBeGreaterThan(25);
      await context.tracing.stop();
    } finally {
      await browser.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
