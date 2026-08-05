import { spawn, type ChildProcess } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { capture } from '../src/stages/capture.js';
import { render } from '../src/stages/render.js';

let server: ChildProcess;

const SCENARIO = {
  version: 2, id: 'render-check', title: 'Render check', outputType: 'feature-clip', audience: 'operators',
  actors: [{ id: 'operator', label: 'Operator' }],
  scenes: [{
    id: 'create', title: 'Create an item', purpose: 'state-change', actor: 'operator',
    actions: [
      { type: 'goto', path: '/stateful' },
      { type: 'click', target: { by: 'role', role: 'button', value: 'Create item' } },
      { type: 'assert', target: { by: 'text', value: 'Item created' }, state: 'visible' }
    ]
  }]
};

beforeAll(async () => {
  server = spawn(process.execPath, ['--import', 'tsx', 'fixtures/neutral/server.ts'], { cwd: resolve('.'), stdio: 'ignore' });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { if ((await fetch('http://127.0.0.1:4173/health')).ok) break; } catch {}
    await new Promise((wait) => setTimeout(wait, 100));
  }
});

afterAll(() => server?.kill('SIGTERM'));

describe('render stage', () => {
  test('turns captured footage into a playable master', async () => {
    const config = { app: { url: 'http://127.0.0.1:4173' } };
    const captured = await capture({ scenario: SCENARIO, config, device: 'desktop' });

    const rendered = await render(
      { scenario: SCENARIO, config, device: 'desktop', artifacts: captured.artifacts as Record<string, string> },
      { download: async (keys) => keys }
    );

    expect(rendered.passed).toBe(true);
    const artifacts = rendered.artifacts as Record<string, string>;
    expect(artifacts.video).toMatch(/\.mp4$/);
    expect((await stat(artifacts.video)).size).toBeGreaterThan(10_000);
  }, 300_000);
});
