import { execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { renderDemo } from '../src/render.js';
import { ConfigSchema, ScenarioSchema } from '../src/schemas.js';

const execFileAsync = promisify(execFile);

describe('render frame rate', () => {
  it('composes at the capture rate instead of resampling the recording', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'product-demo-fps-render-'));
    const raw = join(directory, 'raw-intro.webm');
    await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=25', '-c:v', 'libvpx', raw]);
    const scenario = ScenarioSchema.parse({
      version: 2, id: 'fps-proof', title: 'Frame rate proof', outputType: 'feature-clip', audience: 'operators',
      actors: [{ id: 'user', label: 'Operator' }],
      scenes: [{ id: 'intro', title: 'Intro', purpose: 'proof', actor: 'user', presentation: { loading: 'preserve', caption: { mode: 'none' } }, actions: [{ type: 'goto', path: '/' }] }]
    });
    const config = ConfigSchema.parse({ app: { url: 'http://127.0.0.1:4173' }, devices: { test: { width: 320, height: 240 } } });

    const video = await renderDemo({ scenario, config, device: 'test', outputDirectory: join(directory, 'render'), executionReport: { artifacts: { 'raw-intro': raw } } });

    const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate,nb_read_frames', '-count_frames', '-of', 'csv=p=0', video]);
    const [rate, frames] = stdout.trim().split(',');
    expect(rate).toBe('25/1');
    expect(Number(frames)).toBeLessThanOrEqual(52);
  }, 240_000);
});
