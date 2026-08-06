import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { discover } from '../src/stages/discover.js';

let server: ChildProcess;

beforeAll(async () => {
  server = spawn(process.execPath, ['--import', 'tsx', 'fixtures/neutral/server.ts'], { cwd: resolve('.'), stdio: 'ignore' });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { if ((await fetch('http://127.0.0.1:4173/health')).ok) break; } catch {}
    await new Promise((wait) => setTimeout(wait, 100));
  }
});

afterAll(() => server?.kill('SIGTERM'));

test('confirms the model against the running product and names its evidence', async () => {
  const result = await discover({
    config: { app: { url: 'http://127.0.0.1:4173' }, repository: { root: resolve('fixtures/neutral/handoff') } }
  });

  expect(result.passed).toBe(true);
  const model = result.model as { proofSurfaces: Array<{ id: string; evidence: Array<Record<string, string>> }> };
  const runtime = model.proofSurfaces.flatMap((surface) => surface.evidence.filter((entry) => entry.type === 'runtime'));
  expect(runtime.length).toBeGreaterThan(0);

  const artifacts = result.artifacts as Record<string, string>;
  for (const entry of runtime) {
    expect(entry.screenshot).not.toMatch(/^\//);
    expect(artifacts[entry.screenshot]).toMatch(/^\//);
  }
}, 120_000);
