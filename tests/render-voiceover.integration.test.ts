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
      version: 1, id: 'voiceover-proof', title: 'Voiceover proof', locale: 'en', narration: 'voiceover',
      actors: [{ id: 'user', role: 'user' }],
      scenes: [{ id: 'intro', title: 'Welcome', description: 'A concise narrated scene', actor: 'user', actions: [{ type: 'goto', path: '/' }] }]
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
});
