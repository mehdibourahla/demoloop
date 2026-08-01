import { describe, expect, test, vi } from 'vitest';
import { runCli } from '../src/cli.js';

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
});
