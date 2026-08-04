import { execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { renderDemo } from '../src/render.js';
import { ConfigSchema, ScenarioSchema } from '../src/schemas.js';

const execFileAsync = promisify(execFile);

describe('voiceover rendering', () => {
  it('mixes measured narration into the normalized MP4', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'product-demo-render-'));
    const raw = join(directory, 'raw-intro.webm');
    await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=white:s=320x240:d=2', '-c:v', 'libvpx-vp9', raw]);
    const scenario = ScenarioSchema.parse({
      version: 2, id: 'voiceover-proof', title: 'Voiceover proof', outputType: 'feature-clip', audience: 'operators', locale: 'en', audio: { policy: 'voiceover' },
      actors: [{ id: 'user', label: 'Operator' }],
      scenes: [{ id: 'intro', title: 'Welcome', description: 'A concise narrated scene', purpose: 'hook', actor: 'user', presentation: { maxStaticHoldMs: 3_000, camera: { type: 'none' }, loading: 'cut', transitionWeight: 'light', caption: { mode: 'none' } }, actions: [{ type: 'goto', path: '/' }] }]
    });
    const config = ConfigSchema.parse({ app: { url: 'http://127.0.0.1:4173' }, devices: { test: { width: 320, height: 240 } } });
    const video = await renderDemo({
      scenario, config, device: 'test', outputDirectory: join(directory, 'render'), executionReport: { artifacts: { 'raw-intro': raw } },
      narrationProvider: { synthesize: async (segment) => {
        await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.5', '-c:a', 'libmp3lame', segment.outputPath]);
        return { path: segment.outputPath, durationSeconds: 0.5 };
      } }
    });
    const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name', '-of', 'json', video]);
    const streams = (JSON.parse(stdout) as { streams: Array<{ codec_type: string; codec_name: string }> }).streams;
    expect(streams.map(({ codec_type, codec_name }) => `${codec_type}/${codec_name}`)).toEqual(expect.arrayContaining(['video/h264', 'audio/aac']));
    const { stderr } = await execFileAsync('ffmpeg', ['-hide_banner', '-i', video, '-vn', '-af', 'volumedetect', '-f', 'null', '-']);
    const maxVolume = Number(stderr.match(/max_volume:\s*(-?[\d.]+) dB/)?.[1]);
    expect(maxVolume).toBeGreaterThan(-30);
  }, 120_000);

  it('keeps enough footage for the narration when trimming a static scene', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'product-demo-floor-'));
    const raw = join(directory, 'raw-intro.webm');
    await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=white:s=320x240:d=8:r=30', '-c:v', 'libvpx-vp9', raw]);
    const scenario = ScenarioSchema.parse({
      version: 2, id: 'floor-proof', title: 'Floor proof', outputType: 'feature-clip', audience: 'operators', locale: 'en', audio: { policy: 'voiceover' },
      actors: [{ id: 'user', label: 'Operator' }],
      scenes: [{ id: 'intro', title: 'Welcome', purpose: 'hook', actor: 'user', presentation: { maxStaticHoldMs: 1_000, camera: { type: 'none' }, loading: 'cut', transitionWeight: 'light', caption: { mode: 'none' } }, actions: [{ type: 'goto', path: '/' }] }]
    });
    const config = ConfigSchema.parse({ app: { url: 'http://127.0.0.1:4173' }, devices: { test: { width: 320, height: 240 } } });

    const video = await renderDemo({
      scenario, config, device: 'test', outputDirectory: join(directory, 'render'), executionReport: { artifacts: { 'raw-intro': raw } },
      narrationProvider: { synthesize: async (segment) => {
        await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=4', '-c:a', 'libmp3lame', segment.outputPath]);
        return { path: segment.outputPath, durationSeconds: 4 };
      } }
    });

    const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', video]);
    expect(Number(stdout.trim())).toBeGreaterThanOrEqual(4);
  }, 240_000);

  it('lands quiet and loud narration at a comparable level', async () => {
    const levels = await Promise.all([1, 0.1].map(async (amplitude) => {
      const directory = await mkdtemp(join(tmpdir(), `product-demo-level-${amplitude}-`));
      const raw = join(directory, 'raw-intro.webm');
      await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=white:s=320x240:d=3', '-c:v', 'libvpx-vp9', raw]);
      const scenario = ScenarioSchema.parse({
        version: 2, id: 'level-proof', title: 'Level proof', outputType: 'feature-clip', audience: 'operators', locale: 'en', audio: { policy: 'voiceover' },
        actors: [{ id: 'user', label: 'Operator' }],
        scenes: [{ id: 'intro', title: 'Welcome', purpose: 'hook', actor: 'user', actions: [{ type: 'goto', path: '/' }] }]
      });
      const config = ConfigSchema.parse({ app: { url: 'http://127.0.0.1:4173' }, devices: { test: { width: 320, height: 240 } } });
      const video = await renderDemo({
        scenario, config, device: 'test', outputDirectory: join(directory, 'render'), executionReport: { artifacts: { 'raw-intro': raw } },
        narrationProvider: { synthesize: async (segment) => {
          await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=frequency=300:duration=2.5`, '-af', `volume=${amplitude}`, '-c:a', 'libmp3lame', segment.outputPath]);
          return { path: segment.outputPath, durationSeconds: 2.5 };
        } }
      });
      const { stderr } = await execFileAsync('ffmpeg', ['-hide_banner', '-i', video, '-vn', '-af', 'volumedetect', '-f', 'null', '-']);
      return Number(stderr.match(/max_volume:\s*(-?[\d.]+) dB/)?.[1]);
    }));

    expect(Math.abs(levels[0] - levels[1])).toBeLessThan(4);
  }, 240_000);
});
