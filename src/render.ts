import { execFile } from 'node:child_process';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { chromium } from 'playwright';
import type { NarrationProvider } from './adapters.js';
import { resolveAudioPolicy } from './audio.js';
import { buildEdl, outputCuts, padClip, prepareClip, type EdlClip } from './editing.js';
import { presentationLayout } from './presentation.js';
import type { DemoConfig, Scenario } from './schemas.js';

const execFileAsync = promisify(execFile);
const FPS = 30;

interface RenderOptions {
  scenario: Scenario;
  config: DemoConfig;
  executionReport: { artifacts: Record<string, string> };
  outputDirectory: string;
  device: string;
  narrationProvider?: NarrationProvider;
}

export async function renderDemo(options: RenderOptions): Promise<string> {
  await mkdir(options.outputDirectory, { recursive: true });
  const publicDirectory = join(options.outputDirectory, 'public');
  await mkdir(publicDirectory, { recursive: true });
  const audioPolicy = await resolveAudioPolicy(options.scenario.audio);
  const clips = [];
  const edits: Array<{ id: string; removedSeconds: number }> = [];
  const edlClips: EdlClip[] = [];
  const holds: Array<{ id: string; heldSeconds: number }> = [];
  for (const scene of options.scenario.scenes) {
    const rawPath = options.executionReport.artifacts[`raw-${scene.id}`];
    if (!rawPath) throw new Error(`Raw recording missing for scene ${scene.id}`);
    let audioSrc: string | undefined;
    let narrationSeconds = 0;
    if (audioPolicy.voiceover) {
      if (!options.narrationProvider) throw new Error('Voiceover requested but no narration provider is configured');
      const scripted = scene.actions.map((action) => action.narration).filter((value): value is string => Boolean(value));
      const text = scripted.length ? scripted.join(' ') : [scene.title, scene.description].filter(Boolean).join('. ');
      const audioName = `voice-${scene.id}.mp3`;
      const speech = await options.narrationProvider.synthesize({ id: scene.id, text, locale: options.scenario.locale, outputPath: join(publicDirectory, audioName) });
      narrationSeconds = speech.durationSeconds;
      audioSrc = audioName;
    }
    const prepared = await prepareClip(rawPath, join(options.outputDirectory, `trimmed-${scene.id}.mp4`), scene.presentation, narrationSeconds);
    if (prepared.removedSeconds > 0) edits.push({ id: scene.id, removedSeconds: Number(prepared.removedSeconds.toFixed(3)) });
    edlClips.push({ id: scene.id, sourcePath: rawPath, purpose: scene.purpose, title: scene.title, segments: prepared.segments });
    let clipPath = prepared.path;
    let clipSeconds = prepared.durationSeconds;
    if (narrationSeconds > clipSeconds + 0.02) {
      const heldPath = join(options.outputDirectory, `held-${scene.id}.mp4`);
      clipSeconds = await padClip(prepared.path, heldPath, narrationSeconds);
      clipPath = heldPath;
      holds.push({ id: scene.id, heldSeconds: Number((narrationSeconds - prepared.durationSeconds).toFixed(3)) });
    }
    const fileName = basename(clipPath);
    await copyFile(clipPath, join(publicDirectory, fileName));
    const durationInFrames = Math.max(1, Math.ceil(clipSeconds * FPS));
    clips.push({ src: fileName, durationInFrames, title: scene.title, description: scene.description, purpose: scene.purpose, presentation: scene.presentation, audioSrc });
  }
  let music: { src: string; level: number; fadeInFrames: number; fadeOutFrames: number } | undefined;
  if (audioPolicy.musicPath) {
    const musicName = `music-${basename(audioPolicy.musicPath)}`;
    await copyFile(audioPolicy.musicPath, join(publicDirectory, musicName));
    music = { src: musicName, level: audioPolicy.musicLevel ?? 0.2, fadeInFrames: Math.round(((audioPolicy.fadeInMs ?? 0) / 1_000) * FPS), fadeOutFrames: Math.round(((audioPolicy.fadeOutMs ?? 0) / 1_000) * FPS) };
  }
  const serveUrl = await bundle(resolve('remotion/index.tsx'), undefined, { publicDir: publicDirectory });
  const inputProps = { clips, brand: options.scenario.branding, music };
  const selected = await selectComposition({ serveUrl, id: 'ProductDemo', inputProps, browserExecutable: chromium.executablePath(), logLevel: 'error' });
  const profile = options.config.devices[options.device];
  const composition = { ...selected, width: profile.width, height: profile.height, durationInFrames: clips.reduce((sum, clip) => sum + clip.durationInFrames, 0) };
  const remotionPath = join(options.outputDirectory, 'remotion.mp4');
  await renderMedia({ composition, serveUrl, codec: 'h264', pixelFormat: 'yuv420p', outputLocation: remotionPath, inputProps, browserExecutable: chromium.executablePath(), overwrite: true, logLevel: 'error', crf: 20, concurrency: 2 });
  const finalPath = join(options.outputDirectory, `${options.scenario.id}-${options.device}.mp4`);
  const normalization = ['-y', '-loglevel', 'error', '-i', remotionPath, '-map', '0:v:0'];
  if (options.scenario.audio.policy === 'silent') normalization.push('-an');
  else normalization.push('-map', '0:a:0', '-c:a', 'aac', '-b:a', '192k');
  if (options.scenario.audio.policy !== 'silent') normalization.push('-af', 'loudnorm=I=-16:TP=-1.5:LRA=11');
  normalization.push('-vf', 'scale=in_range=full:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-color_range', 'tv', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', finalPath);
  await execFileAsync('ffmpeg', normalization);
  await writeFile(join(options.outputDirectory, 'presentation-metadata.json'), JSON.stringify({
    version: 1,
    video: finalPath,
    scenes: options.scenario.scenes.map((scene) => ({ id: scene.id, purpose: scene.purpose, ...presentationLayout(scene.presentation, profile.width, profile.height) })),
    edits,
    holds,
    cuts: outputCuts(edlClips),
  }, null, 2));
  await writeFile(join(options.outputDirectory, 'edl.json'), JSON.stringify(buildEdl(edlClips), null, 2));
  return finalPath;
}
