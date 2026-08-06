import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
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

const config = ConfigSchema.parse({ app: { url: 'http://127.0.0.1:4173' } });

function scenario(actions: unknown[]) {
  return ScenarioSchema.parse({
    version: 2, id: 'adaptive-intake', title: 'Adaptive intake', outputType: 'feature-clip', audience: 'clinicians',
    actors: [{ id: 'operator', label: 'Operator' }],
    scenes: [{ id: 'intake', title: 'Complete intake', purpose: 'proof', actor: 'operator', actions }]
  });
}

const safeChoice = {
  type: 'choose',
  target: { by: 'rolePattern', role: 'button', pattern: '.' },
  prefer: ['No new symptoms', 'None reported', 'Nothing further'],
  avoid: ['weakness', 'vision changes']
};

describe('adaptive interfaces', () => {
  test('repeats a declared intent until the form reports completion', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'demoloop-intake-'));

    const report = ExecutionReportSchema.parse(await executeScenario({
      scenario: scenario([
        { type: 'goto', path: '/intake' },
        { type: 'repeat', until: { target: { by: 'text', value: 'Assessment complete' }, state: 'visible' }, maxIterations: 8, actions: [safeChoice] },
        { type: 'assert', target: { by: 'text', value: 'Assessment complete' }, state: 'visible' }
      ]),
      config, mode: 'rehearse', outputDirectory, device: 'desktop'
    }));

    expect(report.passed).toBe(true);
    const timeline = TimelineSchema.parse(JSON.parse(await readFile(report.artifacts.timeline, 'utf8')));
    const repeated = timeline.events.find((event) => event.type === 'repeat');
    expect(repeated?.label).toContain('3');
  }, 90_000);

  test('records which option each declared intent selected', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'demoloop-choice-'));

    const report = ExecutionReportSchema.parse(await executeScenario({
      scenario: scenario([{ type: 'goto', path: '/intake' }, safeChoice]),
      config, mode: 'rehearse', outputDirectory, device: 'desktop'
    }));

    expect(report.passed).toBe(true);
    expect(report.executedPath).toContainEqual({ sceneId: 'intake', actionIndex: 1, detail: 'chose "No new symptoms"' });
  }, 90_000);

  test('refuses to click an option the scenario forbids', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'demoloop-avoid-'));

    const report = ExecutionReportSchema.parse(await executeScenario({
      scenario: scenario([
        { type: 'goto', path: '/intake' },
        { ...safeChoice, prefer: [], avoid: ['weakness', 'No new symptoms'] }
      ]),
      config, mode: 'rehearse', outputDirectory, device: 'desktop'
    }));

    expect(report.passed).toBe(false);
    expect(report.scenes[0].failure).toMatch(/no permitted option/i);
  }, 90_000);

  test('takes a branch only when its condition currently holds', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'demoloop-branch-'));

    const report = ExecutionReportSchema.parse(await executeScenario({
      scenario: scenario([
        { type: 'goto', path: '/intake' },
        {
          type: 'branch',
          when: { target: { by: 'text', value: 'Any new symptoms?' }, state: 'visible' },
          then: [safeChoice],
          otherwise: [{ type: 'assert', target: { by: 'text', value: 'Assessment complete' }, state: 'visible' }]
        },
        { type: 'assert', target: { by: 'text', value: 'Any changes since yesterday?' }, state: 'visible' }
      ]),
      config, mode: 'rehearse', outputDirectory, device: 'desktop'
    }));

    expect(report.passed).toBe(true);
    expect(report.executedPath).toContainEqual({ sceneId: 'intake', actionIndex: 1, detail: 'branch taken: then' });
  }, 90_000);
});
