import { execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, test } from 'vitest';
import { analyzeVideo, seamChanges } from '../src/visual-analysis.js';

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

  test('counts a small localized change as a distinct frame', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'demo-detail-'));
    const video = join(directory, 'detail.mp4');
    await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=1440x900:d=6:r=10',
      '-vf', "drawbox=x=60:y=90:w=150:h=26:color=white:t=fill:enable='gt(t,3)'", '-pix_fmt', 'yuv420p', video]);

    const analysis = await analyzeVideo(video, { samplesPerSecond: 2, staticWarnSeconds: 2 });

    expect(analysis.samples.find((sample) => sample.timestampSeconds === 3)?.changeRatio).toBeGreaterThan(0);
    expect(analysis.staticSpans.some((span) => span.startSeconds < 3 && span.endSeconds > 3)).toBe(false);
  }, 60_000);

  test('ignores changes inside an excluded overlay band', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'demo-overlay-'));
    const video = join(directory, 'overlay.mp4');
    await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=1440x900:d=8:r=10',
      '-vf', "drawbox=x=60:y=780:w=900:h=90:color=white:t=fill:enable='gt(t,4)'", '-pix_fmt', 'yuv420p', video]);

    const withOverlay = await analyzeVideo(video, { samplesPerSecond: 2, staticWarnSeconds: 3 });
    const productOnly = await analyzeVideo(video, { samplesPerSecond: 2, staticWarnSeconds: 3, excludeRegions: [{ x: 0, y: 0.82, width: 1, height: 0.18 }] });

    expect(withOverlay.staticSpans.some((span) => span.durationSeconds >= 7)).toBe(false);
    expect(productOnly.staticSpans.some((span) => span.durationSeconds >= 7)).toBe(true);
  }, 60_000);

  test('reports a seamless cut as quiet and a jump cut as loud', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'demo-seam-'));
    const seamless = join(directory, 'seamless.mp4');
    const jump = join(directory, 'jump.mp4');
    await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=640x480:d=6:r=10', '-pix_fmt', 'yuv420p', seamless]);
    await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=640x480:d=3:r=10', '-f', 'lavfi', '-i', 'color=c=white:s=640x480:d=3:r=10',
      '-filter_complex', '[0:v][1:v]concat=n=2:v=1', '-pix_fmt', 'yuv420p', jump]);

    const quiet = await seamChanges(seamless, [3]);
    const loud = await seamChanges(jump, [3]);

    expect(quiet[0].changeRatio).toBeLessThan(0.05);
    expect(loud[0].changeRatio).toBeGreaterThan(0.5);
  }, 90_000);

  test('recognizes meaningful motion', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'demo-motion-'));
    const video = join(directory, 'motion.mp4');
    await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x240:d=3:r=30', '-pix_fmt', 'yuv420p', video]);
    const analysis = await analyzeVideo(video, { samplesPerSecond: 2, changeThreshold: 0.01, staticWarnSeconds: 2 });
    expect(analysis.distinctRatio).toBeGreaterThan(0.5);
  });
});
