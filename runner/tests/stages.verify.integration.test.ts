import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { verify } from '../src/stages/verify.js';

let server: ChildProcess;

const SCENARIO = {
  version: 2, id: 'drift-check', title: 'Drift check', outputType: 'feature-clip', audience: 'operators',
  actors: [{ id: 'operator', label: 'Operator' }],
  scenes: [{
    id: 'create', title: 'Create an item', purpose: 'state-change', actor: 'operator',
    actions: [
      { type: 'goto', path: '/stateful' },
      { type: 'click', target: { by: 'role', role: 'button', value: 'Create item' } }
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

test('reports every target as resolved against an unchanged product', async () => {
  const result = await verify({ scenario: SCENARIO, config: { app: { url: 'http://127.0.0.1:4173' } } });

  expect(result.passed).toBe(true);
  expect(result.drifted).toEqual([]);
}, 120_000);

test('names the scene and target when the product moved underneath the demo', async () => {
  const renamed = structuredClone(SCENARIO);
  renamed.scenes[0].actions[1].target = { by: 'role', role: 'button', value: 'Create record' };

  const result = await verify({ scenario: renamed, config: { app: { url: 'http://127.0.0.1:4173' } } });

  expect(result.passed).toBe(false);
  const drifted = result.drifted as Array<{ sceneId: string; label: string; status: string }>;
  expect(drifted).toHaveLength(1);
  expect(drifted[0].sceneId).toBe('create');
  expect(drifted[0].label).toBe('Create record');
}, 120_000);
