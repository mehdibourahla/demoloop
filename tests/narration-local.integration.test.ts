import { execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, test } from 'vitest';
import { MacOSNarrationProvider } from '../src/narration.js';

const execFileAsync = promisify(execFile);

describe('macOS narration', () => {
  // `say` ships with macOS only; on any other platform this provider cannot exist.
  test.skipIf(process.platform !== 'darwin')('produces measured audible English speech locally', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'demoloop-macos-narration-'));
    const outputPath = join(directory, 'voice.mp3');
    const provider = new MacOSNarrationProvider({ voice: 'Samantha' });

    const result = await provider.synthesize({
      id: 'intro',
      text: 'The workspace prepares the context before the review begins.',
      locale: 'en',
      outputPath
    });

    expect(result.path).toBe(outputPath);
    expect(result.durationSeconds).toBeGreaterThan(1);
    const { stderr } = await execFileAsync('ffmpeg', ['-hide_banner', '-i', outputPath, '-af', 'volumedetect', '-f', 'null', '-']);
    const maxVolume = Number(stderr.match(/max_volume:\s*(-?[\d.]+) dB/)?.[1]);
    expect(maxVolume).toBeGreaterThan(-60);
  }, 30_000);
});
