import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { capture } from '../src/stages/capture.js';
import { discoverProduct } from '../../src/discovery.js';
import { planDemo } from '../../src/planner.js';

let server: ChildProcess;

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { if ((await fetch('http://127.0.0.1:4173/health')).ok) return; } catch {}
    await new Promise((wait) => setTimeout(wait, 100));
  }
  throw new Error('fixture server did not start');
}

beforeAll(async () => {
  server = spawn(process.execPath, ['--import', 'tsx', 'fixtures/neutral/server.ts'], { cwd: resolve('.'), stdio: 'ignore' });
  await waitForServer();
});

afterAll(() => server?.kill('SIGTERM'));

describe('runner capture', () => {
  test('rehearses and records a real scenario from a job payload', async () => {
    const model = await discoverProduct(resolve('fixtures/neutral/handoff'));
    const planned = planDemo(model, { mode: 'journey', journeyId: 'deliver-item', locale: 'en' });
    if (planned.status !== 'planned') throw new Error('Expected planned handoff');

    const report = await capture({
      scenario: planned.outputs[0],
      config: { app: { url: 'http://127.0.0.1:4173' } },
      device: 'desktop'
    });

    expect(report.mode).toBe('record');
    expect(report.passed).toBe(true);
    expect((report.provenance as { appUrl: string }).appUrl).toBe('http://127.0.0.1:4173');
    expect(Object.keys(report.artifacts as Record<string, string>)).toEqual(
      expect.arrayContaining(['report', 'timeline'])
    );
  }, 180_000);
});
