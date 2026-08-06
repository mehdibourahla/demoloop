import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, test } from 'vitest';
import { canRecord, captureProvenance, scenarioDigest } from '../src/receipt.js';

const execFileAsync = promisify(execFile);

async function gitRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'demoloop-git-'));
  await execFileAsync('git', ['init', '-q'], { cwd: root });
  await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: root });
  await writeFile(join(root, 'app.txt'), 'first');
  await execFileAsync('git', ['add', '-A'], { cwd: root });
  await execFileAsync('git', ['commit', '-qm', 'first'], { cwd: root });
  return root;
}

describe('rehearsal receipt', () => {
  test('permits recording only after two consecutive passes of the exact scenario', async () => {
    const digest = await scenarioDigest({ id: 'a', scenes: [] });
    expect(canRecord(digest, { scenarioDigest: digest, consecutivePasses: 2, passed: true })).toBe(true);
    expect(canRecord(digest, { scenarioDigest: digest, consecutivePasses: 1, passed: true })).toBe(false);
    expect(canRecord(digest, { scenarioDigest: 'stale', consecutivePasses: 2, passed: true })).toBe(false);
  });

  test('honours a stricter configured pass requirement', async () => {
    const digest = await scenarioDigest({ id: 'a', scenes: [] });
    expect(canRecord(digest, { scenarioDigest: digest, consecutivePasses: 2, passed: true }, 3)).toBe(false);
    expect(canRecord(digest, { scenarioDigest: digest, consecutivePasses: 3, passed: true }, 3)).toBe(true);
  });

  test('digest is stable across object key order', async () => {
    expect(await scenarioDigest({ b: 2, a: 1 })).toBe(await scenarioDigest({ a: 1, b: 2 }));
  });

  test('editorial presentation changes invalidate the rehearsal receipt', async () => {
    const base = { version: 2, id: 'demo', scenes: [{ id: 'result', presentation: { caption: { mode: 'none' } } }] };
    const changed = { version: 2, id: 'demo', scenes: [{ id: 'result', presentation: { caption: { mode: 'lower-third', safeArea: 'bottom' } } }] };

    expect(await scenarioDigest(base)).not.toBe(await scenarioDigest(changed));
  });
});

describe('capture provenance', () => {
  test('records the commit the capture actually ran against', async () => {
    const root = await gitRepository();
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root });

    const provenance = await captureProvenance(root, 'http://127.0.0.1:4173');

    expect(provenance).toEqual({ commit: stdout.trim(), dirty: false, appUrl: 'http://127.0.0.1:4173' });
  });

  test('marks a working tree that no commit can reproduce', async () => {
    const root = await gitRepository();
    await writeFile(join(root, 'app.txt'), 'edited after the commit');

    expect((await captureProvenance(root, 'http://127.0.0.1:4173')).dirty).toBe(true);
  });

  test('claims no commit when the capture target is not a checkout', async () => {
    const root = await mkdtemp(join(tmpdir(), 'demoloop-nogit-'));

    expect(await captureProvenance(root, 'http://127.0.0.1:4173')).toEqual({ appUrl: 'http://127.0.0.1:4173' });
  });
});
