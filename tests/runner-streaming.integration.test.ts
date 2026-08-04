import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { executeScenario } from '../src/runner.js';
import { ConfigSchema, ExecutionReportSchema, ScenarioSchema } from '../src/schemas.js';

let server: ChildProcess;

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { if ((await fetch('http://127.0.0.1:4173/health')).ok) return; } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error('fixture server did not start');
}

beforeAll(async () => {
  server = spawn(process.execPath, ['--import', 'tsx', 'fixtures/neutral/server.ts'], { cwd: resolve('.'), stdio: 'ignore' });
  await waitForServer();
});

afterAll(() => server?.kill('SIGTERM'));

const config = ConfigSchema.parse({ app: { url: 'http://127.0.0.1:4173' } });

function scenario(actions: unknown[]) {
  return ScenarioSchema.parse({
    version: 2, id: 'streaming-demo', title: 'Streaming assistant', outputType: 'feature-clip', audience: 'operators',
    actors: [{ id: 'operator', label: 'Operator' }],
    scenes: [{ id: 'ask', title: 'Ask the assistant', purpose: 'proof', actor: 'operator', actions }]
  });
}

describe('streaming interfaces', () => {
  test('navigates an application whose network never goes idle', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'product-demo-stream-'));

    const report = ExecutionReportSchema.parse(await executeScenario({
      scenario: scenario([{ type: 'goto', path: '/streaming' }, { type: 'assert', target: { by: 'text', value: 'Assistant' }, state: 'visible' }]),
      config, mode: 'rehearse', outputDirectory, device: 'desktop'
    }));

    expect(report.passed).toBe(true);
  }, 60_000);

  test('waits for a streamed reply to settle before the next action', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'product-demo-stream-wait-'));

    const report = ExecutionReportSchema.parse(await executeScenario({
      scenario: scenario([
        { type: 'goto', path: '/streaming' },
        { type: 'fill', target: { by: 'label', value: 'Message' }, text: 'How does this work?' },
        { type: 'click', target: { by: 'role', role: 'button', value: 'Send' } },
        { type: 'waitFor', target: { by: 'label', value: 'Message' }, state: 'enabled' },
        { type: 'assert', target: { by: 'text', value: 'Stream complete' }, state: 'visible' }
      ]),
      config, mode: 'rehearse', outputDirectory, device: 'desktop'
    }));

    expect(report.passed).toBe(true);
    expect(report.scenes[0].status).toBe('passed');
  }, 60_000);
});
