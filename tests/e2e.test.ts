import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { discoverProduct } from '../src/discovery.js';
import { evaluateDemo } from '../src/evaluate.js';
import { planDemo } from '../src/planner.js';
import { renderDemo } from '../src/render.js';
import { executeScenario } from '../src/runner.js';
import { ConfigSchema, ExecutionReportSchema, QualityReportSchema } from '../src/schemas.js';

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

describe('fresh-checkout vertical slice', () => {
  test('discovers, plans, rehearses, records, renders and evaluates desktop and mobile MP4s', async () => {
    const root = await mkdtemp(join(tmpdir(), 'product-demo-e2e-'));
    const model = await discoverProduct(resolve('fixtures/neutral/handoff'), 'http://127.0.0.1:4173', join(root, 'discovery'));
    expect(model.journeys.some((journey) => journey.id === 'deliver-item')).toBe(true);
    const planned = planDemo(model, { mode: 'journey', journeyId: 'deliver-item', locale: 'en', audience: 'operations', audio: { policy: 'silent' } });
    if (planned.status !== 'planned') throw new Error('Expected the neutral handoff journey to be planned');
    const scenario = planned.outputs[0];
    const config = ConfigSchema.parse({ app: { url: 'http://127.0.0.1:4173' } });
    for (const device of ['desktop', 'mobile']) {
      const base = join(root, device);
      const rehearsal = ExecutionReportSchema.parse(await executeScenario({ scenario, config, mode: 'rehearse', outputDirectory: join(base, 'rehearsal'), device }));
      const recording = ExecutionReportSchema.parse(await executeScenario({ scenario, config, mode: 'record', outputDirectory: join(base, 'recording'), device, rehearsalReceiptPath: rehearsal.artifacts.report }));
      const videoPath = await renderDemo({ scenario, config, executionReport: recording, outputDirectory: join(base, 'render'), device });
      expect((await stat(videoPath)).size).toBeGreaterThan(100_000);
      const quality = QualityReportSchema.parse(await evaluateDemo({ scenario, config, executionReport: recording, videoPath, timelinePath: recording.artifacts.timeline, outputPath: join(base, 'quality-report.json'), device }));
      expect(quality.technical.passed).toBe(true);
      expect(quality.agentReview.status).toBe('missing');
      expect(quality.passed).toBe(false);
      expect(quality.encoding?.codec).toBe('h264');
      expect(quality.encoding?.width).toBe(config.devices[device].width);
      expect(quality.encoding?.height).toBe(config.devices[device].height);
    }
  }, 240_000);
});
