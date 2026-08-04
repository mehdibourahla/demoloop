import { execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, test } from 'vitest';
import { applyTrim, buildEdl, contactSheet, outputCuts, prepareClip, trimSegments } from '../src/editing.js';

const execFileAsync = promisify(execFile);

async function durationOf(path: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path]);
  return Number(stdout.trim());
}

describe('edit decision list', () => {
  const clips = [
    { id: 'send', sourcePath: '/raw/raw-send.webm', purpose: 'state-change', title: 'Send the item', segments: [{ startSeconds: 0, endSeconds: 3 }, { startSeconds: 8, endSeconds: 10 }] },
    { id: 'receive', sourcePath: '/raw/raw-receive.webm', purpose: 'proof', title: 'Item received', segments: [{ startSeconds: 0, endSeconds: 4 }] }
  ];

  test('describes every kept range against its source clip', () => {
    const edl = buildEdl(clips);

    expect(edl.sources).toEqual({ send: '/raw/raw-send.webm', receive: '/raw/raw-receive.webm' });
    expect(edl.ranges).toEqual([
      { source: 'send', start: 0, end: 3, beat: 'state-change', note: 'Send the item' },
      { source: 'send', start: 8, end: 10, beat: 'state-change', note: 'Send the item' },
      { source: 'receive', start: 0, end: 4, beat: 'proof', note: 'Item received' }
    ]);
    expect(edl.grade).toBeNull();
    expect(edl.overlays).toEqual([]);
  });

  test('locates every cut on the output timeline', () => {
    expect(outputCuts(clips)).toEqual([
      { outputSeconds: 3, kind: 'trim', sceneId: 'send' },
      { outputSeconds: 5, kind: 'scene', sceneId: 'receive' }
    ]);
  });
});

describe('contact sheet', () => {
  test('tiles the frame from each requested moment, not the same frame repeatedly', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'product-demo-sheet-'));
    const source = join(directory, 'source.mp4');
    const sheet = join(directory, 'sheet.png');
    await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=3:r=30', '-f', 'lavfi', '-i', 'color=c=white:s=320x240:d=3:r=30',
      '-filter_complex', '[0:v][1:v]concat=n=2:v=1', '-pix_fmt', 'yuv420p', source]);

    const moments = await contactSheet(source, sheet, [1, 5]);

    expect(moments).toEqual([1, 5]);
    const { stdout } = await execFileAsync('ffmpeg', ['-loglevel', 'error', '-i', sheet, '-vf', 'scale=2:1,format=gray', '-f', 'rawvideo', 'pipe:1'], { encoding: 'buffer' });
    expect(stdout[0]).toBeLessThan(64);
    expect(stdout[1]).toBeGreaterThan(192);
  }, 90_000);
});

describe('static span trimming', () => {
  test('keeps the whole clip when nothing is inactive for too long', () => {
    expect(trimSegments(10, [], 3)).toEqual([{ startSeconds: 0, endSeconds: 10 }]);
  });

  test('keeps the allowed hold and drops the inactive remainder', () => {
    expect(trimSegments(10, [{ startSeconds: 2, endSeconds: 8, durationSeconds: 6 }], 1)).toEqual([
      { startSeconds: 0, endSeconds: 3 },
      { startSeconds: 8, endSeconds: 10 }
    ]);
  });

  test('leaves a static span shorter than the allowed hold intact', () => {
    expect(trimSegments(10, [{ startSeconds: 2, endSeconds: 2.5, durationSeconds: 0.5 }], 3)).toEqual([{ startSeconds: 0, endSeconds: 10 }]);
  });

  test('trims several inactive spans in one clip', () => {
    expect(trimSegments(20, [
      { startSeconds: 2, endSeconds: 8, durationSeconds: 6 },
      { startSeconds: 12, endSeconds: 18, durationSeconds: 6 }
    ], 1)).toEqual([
      { startSeconds: 0, endSeconds: 3 },
      { startSeconds: 8, endSeconds: 13 },
      { startSeconds: 18, endSeconds: 20 }
    ]);
  });

  test('renders only the kept segments into the trimmed clip', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'product-demo-trim-'));
    const source = join(directory, 'source.mp4');
    const trimmed = join(directory, 'trimmed.mp4');
    await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=10:size=320x240:rate=30', '-pix_fmt', 'yuv420p', source]);

    await applyTrim(source, trimmed, [{ startSeconds: 0, endSeconds: 3 }, { startSeconds: 8, endSeconds: 10 }]);

    expect(await durationOf(trimmed)).toBeLessThan(6);
    expect(await durationOf(trimmed)).toBeGreaterThan(4);
  }, 60_000);

  test('cuts a long inactive stretch out of a recorded clip', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'product-demo-clip-'));
    const source = join(directory, 'raw-scene.mp4');
    await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=black:duration=8:size=320x240:rate=30', '-f', 'lavfi', '-i', 'testsrc=duration=3:size=320x240:rate=30', '-filter_complex', '[0:v][1:v]concat=n=2:v=1', '-pix_fmt', 'yuv420p', source]);

    const cut = await prepareClip(source, join(directory, 'cut.mp4'), { loading: 'cut', maxStaticHoldMs: 1_000 });
    const preserved = await prepareClip(source, join(directory, 'preserved.mp4'), { loading: 'preserve', maxStaticHoldMs: 1_000 });

    expect(cut.durationSeconds).toBeLessThan(6);
    expect(preserved.path).toBe(source);
    expect(preserved.durationSeconds).toBeGreaterThan(10);
  }, 90_000);

  test('never trims a clip down to nothing', () => {
    const segments = trimSegments(6, [{ startSeconds: 0, endSeconds: 6, durationSeconds: 6 }], 1);
    expect(segments).toEqual([{ startSeconds: 0, endSeconds: 1 }]);
  });
});
