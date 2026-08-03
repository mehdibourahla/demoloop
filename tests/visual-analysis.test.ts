import { execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, test } from 'vitest';
import { analyzeVideo } from '../src/visual-analysis.js';

const execFileAsync = promisify(execFile);

describe('visual analysis', () => {
  test('detects repeated static frames with timestamps', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'demo-static-'));
    const video = join(directory, 'static.mp4');
    await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=320x240:d=4', '-pix_fmt', 'yuv420p', video]);
    const analysis = await analyzeVideo(video, { samplesPerSecond: 2, changeThreshold: 0.01, staticWarnSeconds: 2 });
    expect(analysis.sampledFrames).toBeGreaterThanOrEqual(7);
    expect(analysis.distinctRatio).toBeLessThan(0.4);
    expect(analysis.staticSpans[0]).toEqual(expect.objectContaining({ startSeconds: 0 }));
    expect(analysis.staticSpans[0].durationSeconds).toBeGreaterThanOrEqual(3);
  });

  test('recognizes meaningful motion', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'demo-motion-'));
    const video = join(directory, 'motion.mp4');
    await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x240:d=3:r=30', '-pix_fmt', 'yuv420p', video]);
    const analysis = await analyzeVideo(video, { samplesPerSecond: 2, changeThreshold: 0.01, staticWarnSeconds: 2 });
    expect(analysis.distinctRatio).toBeGreaterThan(0.5);
  });
});
