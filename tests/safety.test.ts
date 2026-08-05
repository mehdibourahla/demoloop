import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { assertSafeTarget, scanCaptureArtifacts, scanSensitiveText } from '../src/safety.js';

describe('privacy guard', () => {
  test('allows loopback and refuses production-like hosts', () => {
    expect(() => assertSafeTarget('http://127.0.0.1:4173')).not.toThrow();
    expect(() => assertSafeTarget('https://app.example.com')).toThrow(/production/i);
    expect(() => assertSafeTarget('https://app.example.com', true)).not.toThrow();
  });

  test('scans captured scene text on disk and ignores binary artifacts', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'demoloop-scan-'));
    const textPath = join(directory, 'text-result.txt');
    const screenshotPath = join(directory, 'final-result.png');
    await writeFile(textPath, 'Patient real.person@example.com is ready');
    await writeFile(screenshotPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const findings = await scanCaptureArtifacts({ 'text-result': textPath, 'screenshot-result': screenshotPath });

    expect(findings).toEqual([{ kind: 'email', source: 'text-result', count: 1 }]);
  });

  test('never reports the matched literal', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'demoloop-leak-'));
    const textPath = join(directory, 'text-leak.txt');
    await writeFile(textPath, 'token sk-live-12345678901234567890 for real.person@example.com');

    const findings = await scanCaptureArtifacts({ 'text-leak': textPath });

    expect(JSON.stringify(findings)).not.toContain('sk-live-12345678901234567890');
    expect(JSON.stringify(findings)).not.toContain('real.person@example.com');
  });

  test('aggregates repeated matches of one kind into a single counted finding', () => {
    const findings = scanSensitiveText('a@example.com b@example.com c@example.com', 'timeline');

    expect(findings).toEqual([{ kind: 'email', source: 'timeline', count: 3 }]);
  });

  test('finds secrets and personal identifiers', () => {
    const findings = scanSensitiveText('email real.person@example.com token sk-live-12345678901234567890 health card ABCD-1234-5678', 'scenario');
    expect(findings.map((f) => f.kind)).toEqual(expect.arrayContaining(['email', 'secret', 'health-id']));
  });
});
