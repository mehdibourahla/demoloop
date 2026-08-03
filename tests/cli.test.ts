import { describe, expect, test, vi } from 'vitest';
import { narrationProvider, runCli } from '../src/cli.js';
import { MacOSNarrationProvider } from '../src/narration.js';
import { ConfigSchema, ScenarioSchema } from '../src/schemas.js';

describe('CLI', () => {
  test('prints the supported deterministic pipeline commands', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await runCli(['help'])).toBe(0);
    expect(log.mock.calls.flat().join('\n')).toContain('discover');
    expect(log.mock.calls.flat().join('\n')).toContain('rehearse');
    expect(log.mock.calls.flat().join('\n')).toContain('record');
    expect(log.mock.calls.flat().join('\n')).toContain('render');
    expect(log.mock.calls.flat().join('\n')).toContain('evaluate');
    log.mockRestore();
  });

  test('fails loudly for an unknown command', async () => {
    await expect(runCli(['invent'])).rejects.toThrow(/unknown command/i);
  });

  test('selects local macOS narration for voiceover', () => {
    const config = ConfigSchema.parse({
      app: { url: 'http://127.0.0.1:3005' },
      narration: { provider: 'macos', macos: { voice: 'Samantha' } }
    });
    const scenario = ScenarioSchema.parse({
      version: 1,
      id: 'local-voice',
      title: 'Local voice',
      locale: 'en',
      narration: 'voiceover',
      actors: [{ id: 'doctor', role: 'doctor' }],
      scenes: [{ id: 'dashboard', title: 'Dashboard', actor: 'doctor', actions: [{ type: 'goto', path: '/' }] }]
    });

    expect(narrationProvider(config, scenario)).toBeInstanceOf(MacOSNarrationProvider);
  });
});
