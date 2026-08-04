import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { renderDemo } from '../src/render.js';
import { supportsBurnedSubtitles } from '../src/subtitles.js';
import { ConfigSchema, ScenarioSchema } from '../src/schemas.js';

const execFileAsync = promisify(execFile);

const config = ConfigSchema.parse({ app: { url: 'http://127.0.0.1:4173' }, devices: { test: { width: 640, height: 480 } } });

async function raws(directory: string) {
  const paths: Record<string, string> = {};
  for (const id of ['one', 'two']) {
    const path = join(directory, `raw-${id}.webm`);
    await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc=duration=3:size=640x480:rate=25`, '-c:v', 'libvpx', path]);
    paths[`raw-${id}`] = path;
  }
  return paths;
}

function scenario(overrides: Record<string, unknown> = {}) {
  return ScenarioSchema.parse({
    version: 2, id: 'subtitle-proof', title: 'Subtitle proof', outputType: 'feature-clip', audience: 'operators', locale: 'en',
    audio: { policy: 'voiceover' }, actors: [{ id: 'user', label: 'Operator' }],
    scenes: [
      { id: 'one', title: 'First', purpose: 'interaction', actor: 'user', presentation: { loading: 'preserve', caption: { mode: 'none' } }, actions: [{ type: 'goto', path: '/', narration: 'The first thing happens here. It has two sentences.' }] },
      { id: 'two', title: 'Second', purpose: 'proof', actor: 'user', presentation: { loading: 'preserve', caption: { mode: 'none' } }, actions: [{ type: 'goto', path: '/', narration: 'And then the outcome appears.' }] }
    ],
    ...overrides
  });
}

const narrationProvider = { synthesize: async (segment: { text: string; outputPath: string }) => {
  await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=2.5', '-c:a', 'libmp3lame', segment.outputPath]);
  return { path: segment.outputPath, durationSeconds: 2.5 };
} };

describe('subtitles', () => {
  it('writes an SRT timed across the whole master and names it in the EDL', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'product-demo-srt-'));
    const outputDirectory = join(directory, 'render');

    await renderDemo({ scenario: scenario(), config, device: 'test', outputDirectory, executionReport: { artifacts: await raws(directory) }, narrationProvider });

    const srt = await readFile(join(outputDirectory, 'subtitles.srt'), 'utf8');
    expect(srt).toContain('The first thing happens here.');
    expect(srt).toContain('And then the outcome appears.');
    const starts = [...srt.matchAll(/^(\d{2}):(\d{2}):(\d{2}),(\d{3}) -->/gm)].map((m) => Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000);
    expect(starts[0]).toBe(0);
    expect(starts.at(-1)).toBeGreaterThanOrEqual(3);
    const edl = JSON.parse(await readFile(join(outputDirectory, 'edl.json'), 'utf8'));
    expect(edl.subtitles).toBe(join(outputDirectory, 'subtitles.srt'));
  }, 240_000);

  it('muxes a toggleable subtitle track when asked to embed', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'product-demo-embed-'));
    const video = await renderDemo({ scenario: scenario({ subtitles: 'embedded' }), config, device: 'test', outputDirectory: join(directory, 'render'), executionReport: { artifacts: await raws(directory) }, narrationProvider });

    const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-select_streams', 's', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', video]);
    expect(stdout.trim()).toContain('mov_text');
  }, 300_000);

  it('leaves the picture untouched unless burning is requested', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'product-demo-plain-'));
    const video = await renderDemo({ scenario: scenario(), config, device: 'test', outputDirectory: join(directory, 'render'), executionReport: { artifacts: await raws(directory) }, narrationProvider });

    const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-select_streams', 's', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', video]);
    expect(stdout.trim()).toBe('');
  }, 300_000);

  it('refuses to burn when this ffmpeg cannot render subtitles', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'product-demo-noburn-'));
    if (await supportsBurnedSubtitles()) return;

    await expect(renderDemo({ scenario: scenario({ subtitles: 'burned' }), config, device: 'test', outputDirectory: join(directory, 'render'), executionReport: { artifacts: await raws(directory) }, narrationProvider }))
      .rejects.toThrow(/libass|cannot burn|subtitles filter/i);
  }, 300_000);

  it('refuses to burn subtitles over a lower-third caption', () => {
    expect(() => scenario({
      subtitles: 'burned',
      scenes: [{ id: 'one', title: 'First', purpose: 'proof', actor: 'user', presentation: { caption: { mode: 'lower-third', safeArea: 'bottom' } }, actions: [{ type: 'goto', path: '/', narration: 'Something.' }] }]
    })).toThrow(/one caption mechanism|lower-third/i);
  });
});
