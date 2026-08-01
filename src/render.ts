import { execFile } from 'node:child_process';
import { copyFile, mkdir } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { chromium } from 'playwright';
import type { NarrationProvider } from './adapters.js';
import type { DemoConfig, Scenario } from './schemas.js';

const execFileAsync = promisify(execFile);

interface RenderOptions {
  scenario: Scenario;
  config: DemoConfig;
  executionReport: { artifacts: Record<string, string> };
  outputDirectory: string;
  device: string;
  narrationProvider?: NarrationProvider;
}

async function duration(path: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path]);
  const value = Number(stdout.trim());
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Could not determine duration for ${path}`);
  return value;
}

export async function renderDemo(options: RenderOptions): Promise<string> {
  await mkdir(options.outputDirectory, { recursive: true });
  const publicDirectory = join(options.outputDirectory, 'public');
  await mkdir(publicDirectory, { recursive: true });
  const clips = [];
  for (const scene of options.scenario.scenes) {
    const rawPath = options.executionReport.artifacts[`raw-${scene.id}`];
    if (!rawPath) throw new Error(`Raw recording missing for scene ${scene.id}`);
    const fileName = basename(rawPath);
    await copyFile(rawPath, join(publicDirectory, fileName));
    const durationInFrames = Math.max(1, Math.ceil(await duration(rawPath) * 30));
    let audioSrc: string | undefined;
    if (options.scenario.narration === 'voiceover') {
      if (!options.narrationProvider) throw new Error('Voiceover requested but no narration provider is configured');
      const scripted = scene.actions.map((action) => action.narration).filter((value): value is string => Boolean(value));
      const text = scripted.length ? scripted.join(' ') : [scene.title, scene.description].filter(Boolean).join('. ');
      const audioName = `voice-${scene.id}.mp3`;
      const speech = await options.narrationProvider.synthesize({ id: scene.id, text, locale: options.scenario.locale, outputPath: join(publicDirectory, audioName) });
      const audioFrames = Math.ceil(speech.durationSeconds * 30);
      if (audioFrames > durationInFrames) throw new Error(`Voiceover for scene ${scene.id} is ${speech.durationSeconds.toFixed(2)}s but the recording is only ${(durationInFrames / 30).toFixed(2)}s`);
      audioSrc = audioName;
    }
    clips.push({ src: fileName, durationInFrames, title: scene.title, description: scene.description, audioSrc });
  }
  const serveUrl = await bundle(resolve('remotion/index.tsx'), undefined, { publicDir: publicDirectory });
  const inputProps = { clips, brand: options.scenario.branding };
  const selected = await selectComposition({ serveUrl, id: 'ProductDemo', inputProps, browserExecutable: chromium.executablePath(), logLevel: 'error' });
  const profile = options.config.devices[options.device];
  const composition = { ...selected, width: profile.width, height: profile.height, durationInFrames: clips.reduce((sum, clip) => sum + clip.durationInFrames, 0) };
  const remotionPath = join(options.outputDirectory, 'remotion.mp4');
  await renderMedia({ composition, serveUrl, codec: 'h264', pixelFormat: 'yuv420p', outputLocation: remotionPath, inputProps, browserExecutable: chromium.executablePath(), overwrite: true, logLevel: 'error', crf: 20, concurrency: 2 });
  const finalPath = join(options.outputDirectory, `${options.scenario.id}-${options.device}.mp4`);
  await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-i', remotionPath, '-map', '0:v:0', '-map', '0:a?', '-vf', 'scale=in_range=full:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-color_range', 'tv', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', finalPath]);
  return finalPath;
}
