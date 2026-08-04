import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { discoverProduct } from '../src/discovery.js';
import { planDemo } from '../src/planner.js';
import { executeScenario } from '../src/runner.js';
import { ConfigSchema, ExecutionReportSchema, ScenarioSchema, TimelineSchema } from '../src/schemas.js';

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

describe('deterministic scenario runner', () => {
  test('passes two consecutive rehearsals across isolated handoff contexts', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'product-demo-rehearse-'));
    const model = await discoverProduct(resolve('fixtures/neutral/handoff'));
    const result = planDemo(model, { mode: 'journey', journeyId: 'deliver-item', locale: 'en' });
    if (result.status !== 'planned') throw new Error('Expected planned handoff');
    const planned = result.outputs[0];
    const scenario = ScenarioSchema.parse({ ...planned, scenes: planned.scenes.map((scene) => ({ ...scene, actions: scene.actions.map((action) => ['click', 'fill', 'select'].includes(action.type) ? { ...action, timing: { cursorDurationMs: 300, settleBeforeMs: 150, pauseAfterMs: 700, ...(action.type === 'fill' ? { keystrokeDelayMs: 60 } : {}) } } : action) })) });
    const config = ConfigSchema.parse({ app: { url: 'http://127.0.0.1:4173' } });
    const report = ExecutionReportSchema.parse(await executeScenario({ scenario, config, mode: 'rehearse', outputDirectory, device: 'desktop' }));
    expect(report.passed).toBe(true);
    expect(report.consecutivePasses).toBe(2);
    expect(report.consoleErrors).toEqual([]);
    expect(report.failedRequests).toEqual([]);
    expect(report.scenes.every((scene) => scene.status === 'passed')).toBe(true);
    const timeline = TimelineSchema.parse(JSON.parse(await readFile(report.artifacts.timeline, 'utf8')));
    expect(new Set(timeline.events.map((event) => event.actor))).toEqual(new Set(['origin-context', 'destination-context']));
  }, 60_000);

  test('runs as many rehearsal passes as the configured requirement', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'product-demo-passes-'));
    const model = await discoverProduct(resolve('fixtures/neutral/handoff'));
    const result = planDemo(model, { mode: 'journey', journeyId: 'deliver-item', locale: 'en' });
    if (result.status !== 'planned') throw new Error('Expected planned handoff');
    const config = ConfigSchema.parse({ app: { url: 'http://127.0.0.1:4173' }, runtime: { rehearsalPasses: 3 } });

    const report = ExecutionReportSchema.parse(await executeScenario({ scenario: result.outputs[0], config, mode: 'rehearse', outputDirectory, device: 'desktop' }));

    expect(report.consecutivePasses).toBe(3);
    expect(report.passed).toBe(true);
  }, 90_000);

  test('records real scene videos only with a matching two-pass receipt', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'product-demo-record-'));
    const rehearsalDirectory = join(outputDirectory, 'rehearsal');
    const recordingDirectory = join(outputDirectory, 'recording');
    const model = await discoverProduct(resolve('fixtures/neutral/handoff'));
    const result = planDemo(model, { mode: 'journey', journeyId: 'deliver-item', locale: 'en' });
    if (result.status !== 'planned') throw new Error('Expected planned handoff');
    const planned = result.outputs[0];
    const scenario = ScenarioSchema.parse({ ...planned, scenes: planned.scenes.map((scene) => ({ ...scene, actions: scene.actions.map((action) => ['click', 'fill', 'select'].includes(action.type) ? { ...action, timing: { cursorDurationMs: 300, settleBeforeMs: 150, pauseAfterMs: 700, ...(action.type === 'fill' ? { keystrokeDelayMs: 60 } : {}) } } : action) })) });
    const config = ConfigSchema.parse({ app: { url: 'http://127.0.0.1:4173' } });
    const rehearsal = ExecutionReportSchema.parse(await executeScenario({ scenario, config, mode: 'rehearse', outputDirectory: rehearsalDirectory, device: 'desktop' }));
    const recording = ExecutionReportSchema.parse(await executeScenario({ scenario, config, mode: 'record', outputDirectory: recordingDirectory, device: 'desktop', rehearsalReceiptPath: rehearsal.artifacts.report }));
    expect(recording.passed).toBe(true);
    const rawPaths = Object.entries(recording.artifacts).filter(([key]) => key.startsWith('raw-')).map(([, path]) => path);
    expect(rawPaths).toHaveLength(2);
    for (const path of rawPaths) expect((await stat(path)).size).toBeGreaterThan(10_000);
    const timeline = TimelineSchema.parse(JSON.parse(await readFile(recording.artifacts.timeline, 'utf8')));
    expect(Math.min(...timeline.events.filter((event) => event.type === 'click').map((event) => event.endedAtMs - event.startedAtMs))).toBeGreaterThan(1_050);
    await expect(executeScenario({ scenario: { ...scenario, title: 'Changed after rehearsal' }, config, mode: 'record', outputDirectory: join(outputDirectory, 'stale'), device: 'desktop', rehearsalReceiptPath: rehearsal.artifacts.report })).rejects.toThrow(/rehearsal/i);
  }, 90_000);
});
