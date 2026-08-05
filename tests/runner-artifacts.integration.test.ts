import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { discoverProduct } from '../src/discovery.js';
import { planDemo } from '../src/planner.js';
import { executeScenario } from '../src/runner.js';
import { ConfigSchema, ExecutionReportSchema } from '../src/schemas.js';

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

describe('capture artifacts', () => {
  test('captures the visible text of every recorded scene for privacy scanning', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'demoloop-text-'));
    const model = await discoverProduct(resolve('fixtures/neutral/handoff'));
    const result = planDemo(model, { mode: 'journey', journeyId: 'deliver-item', locale: 'en' });
    if (result.status !== 'planned') throw new Error('Expected planned handoff');
    const config = ConfigSchema.parse({ app: { url: 'http://127.0.0.1:4173' } });
    const rehearsal = ExecutionReportSchema.parse(await executeScenario({ scenario: result.outputs[0], config, mode: 'rehearse', outputDirectory: join(outputDirectory, 'rehearsal'), device: 'desktop' }));

    const recording = ExecutionReportSchema.parse(await executeScenario({ scenario: result.outputs[0], config, mode: 'record', outputDirectory: join(outputDirectory, 'recording'), device: 'desktop', rehearsalReceiptPath: rehearsal.artifacts.report }));

    const textKeys = Object.keys(recording.artifacts).filter((key) => key.startsWith('text-'));
    expect(textKeys).toHaveLength(result.outputs[0].scenes.length);
    expect(await readFile(recording.artifacts[textKeys[0]], 'utf8')).toContain('Delivery board');
    expect(recording.sensitiveFindings).toEqual([]);
    expect(recording.provenance.appUrl).toBe('http://127.0.0.1:4173');
  }, 120_000);

  test('never persists the redaction source value that capture is configured to hide', async () => {
    const secret = 'REDACTION-SOURCE-9F3B7C';
    process.env.DEMOLOOP_TEST_SECRET = secret;
    const outputDirectory = await mkdtemp(join(tmpdir(), 'demoloop-artifacts-'));
    const model = await discoverProduct(resolve('fixtures/neutral/handoff'));
    const result = planDemo(model, { mode: 'journey', journeyId: 'deliver-item', locale: 'en' });
    if (result.status !== 'planned') throw new Error('Expected planned handoff');
    const config = ConfigSchema.parse({
      app: { url: 'http://127.0.0.1:4173' },
      privacy: { redactions: [{ sourceEnv: 'DEMOLOOP_TEST_SECRET', replacement: 'Demo Value' }] }
    });
    const rehearsal = ExecutionReportSchema.parse(await executeScenario({ scenario: result.outputs[0], config, mode: 'rehearse', outputDirectory: join(outputDirectory, 'rehearsal'), device: 'desktop' }));
    const recording = ExecutionReportSchema.parse(await executeScenario({ scenario: result.outputs[0], config, mode: 'record', outputDirectory: join(outputDirectory, 'recording'), device: 'desktop', rehearsalReceiptPath: rehearsal.artifacts.report }));

    expect(Object.keys(recording.artifacts).filter((key) => key.startsWith('trace-'))).toEqual([]);
    for (const path of Object.values(recording.artifacts)) {
      expect(path.endsWith('.zip')).toBe(false);
      expect((await readFile(path)).includes(secret)).toBe(false);
    }
  }, 120_000);
});
