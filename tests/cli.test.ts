import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { ensureApp, narrationProvider, runCli } from '../src/cli.js';
import { MacOSNarrationProvider } from '../src/narration.js';
import { ConfigSchema, ScenarioSchema } from '../src/schemas.js';

describe('CLI', () => {
  test('prints the deterministic production commands', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await runCli(['help'])).toBe(0);
    for (const command of ['discover', 'plan', 'rehearse', 'record', 'render', 'evaluate']) expect(log.mock.calls.flat().join('\n')).toContain(command);
    log.mockRestore();
  });

  test('fails loudly for an unknown command', async () => {
    await expect(runCli(['invent'])).rejects.toThrow(/unknown command/i);
  });

  test('selects local macOS narration for voiceover policy', () => {
    const config = ConfigSchema.parse({ app: { url: 'http://127.0.0.1:3005' }, narration: { provider: 'macos', macos: { voice: 'Samantha' } } });
    const scenario = ScenarioSchema.parse({
      version: 2, id: 'local-voice', title: 'Local voice', outputType: 'feature-clip', audience: 'operators', locale: 'en', audio: { policy: 'voiceover' },
      actors: [{ id: 'operator-console', label: 'Operator console' }],
      scenes: [{ id: 'dashboard', title: 'Dashboard', purpose: 'proof', actor: 'operator-console', actions: [{ type: 'goto', path: '/' }] }]
    });

    expect(narrationProvider(config, scenario)).toBeInstanceOf(MacOSNarrationProvider);
  });

  test('stops the whole application process tree it started', async () => {
    const config = ConfigSchema.parse({
      app: { url: 'http://127.0.0.1:4199', healthcheck: 'http://127.0.0.1:4199/health', startCommand: 'PORT=4199 node --import tsx fixtures/neutral/server.ts & wait', commandCwd: process.cwd() },
      runtime: { startTimeoutMs: 30_000 }
    });

    const cleanup = await ensureApp(config);
    expect((await fetch('http://127.0.0.1:4199/health')).ok).toBe(true);
    await cleanup();

    await expect.poll(async () => {
      try { await fetch('http://127.0.0.1:4199/health'); return 'reachable'; } catch { return 'stopped'; }
    }, { timeout: 10_000 }).toBe('stopped');
  }, 60_000);

  test('writes needs-authoring instead of a route slideshow', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'product-demo-cli-'));
    const modelPath = join(directory, 'product-model.json');
    const configPath = join(directory, 'config.yaml');
    const output = join(directory, 'plan');
    await writeFile(modelPath, JSON.stringify({ version: 2, product: 'Route Catalog', proofSurfaces: [{ id: 'overview', name: 'Overview', route: '/overview', evidence: [{ type: 'source', path: 'src/routes.ts', line: 1 }] }] }));
    await writeFile(configPath, 'app:\n  url: http://127.0.0.1:4173\n');

    const code = await runCli(['plan', '--mode', 'full', '--config', configPath, '--model', modelPath, '--output', output]);

    expect(code).toBe(2);
    const result = JSON.parse(await readFile(join(output, 'needs-authoring.json'), 'utf8'));
    expect(result.status).toBe('needs-authoring');
    expect(result.unresolved[0].kind).toBe('safe-actions');
  });
});
