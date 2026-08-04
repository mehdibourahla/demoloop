import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import type { NarrationProvider, NarrationSegment } from './adapters.js';
import type { Scenario } from './schemas.js';

const execFileAsync = promisify(execFile);

export interface ElevenLabsNarrationOptions {
  apiKey: string;
  voiceId: string;
  cacheDirectory: string;
  modelId?: string;
  outputFormat?: string;
  baseUrl?: string;
}

export interface MacOSNarrationOptions {
  voice: string;
}

async function audioDuration(path: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path]);
  const duration = Number(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`ElevenLabs returned invalid audio for ${path}`);
  return duration;
}

async function exists(path: string): Promise<boolean> {
  try { return (await stat(path)).isFile(); } catch { return false; }
}

export function sceneNarrationText(scene: Scenario['scenes'][number]): string {
  const scripted = scene.actions.map((action) => action.narration).filter((value): value is string => Boolean(value));
  return scripted.length ? scripted.join(' ') : [scene.title, scene.description].filter(Boolean).join('. ');
}

export async function narrationPlan(scenario: Scenario, provider: NarrationProvider | undefined, cacheDirectory: string): Promise<Record<string, number>> {
  if (scenario.audio.policy !== 'voiceover' && scenario.audio.policy !== 'voiceover-and-music') return {};
  if (!provider) throw new Error('Voiceover requires a configured narration provider');
  await mkdir(cacheDirectory, { recursive: true });
  const plan: Record<string, number> = {};
  for (const scene of scenario.scenes) {
    const speech = await provider.synthesize({ id: scene.id, text: sceneNarrationText(scene), locale: scenario.locale, outputPath: join(cacheDirectory, `voice-${scene.id}.mp3`) });
    plan[scene.id] = speech.durationSeconds;
  }
  return plan;
}

export class ElevenLabsNarrationProvider implements NarrationProvider {
  constructor(private readonly options: ElevenLabsNarrationOptions) {
    if (!options.apiKey) throw new Error('ELEVENLABS_API_KEY is required for voiceover');
    if (!options.voiceId) throw new Error('narration.elevenlabs.voiceId is required for voiceover');
  }

  async synthesize(segment: NarrationSegment): Promise<{ path: string; durationSeconds: number }> {
    const modelId = this.options.modelId ?? 'eleven_multilingual_v2';
    const outputFormat = this.options.outputFormat ?? 'mp3_44100_128';
    const digest = createHash('sha256').update(JSON.stringify({ provider: 'elevenlabs', voiceId: this.options.voiceId, modelId, outputFormat, text: segment.text, locale: segment.locale })).digest('hex');
    const cachedPath = join(this.options.cacheDirectory, `${digest}.mp3`);
    await mkdir(this.options.cacheDirectory, { recursive: true });
    if (!await exists(cachedPath)) {
      const endpoint = new URL(`/v1/text-to-speech/${encodeURIComponent(this.options.voiceId)}`, this.options.baseUrl ?? 'https://api.elevenlabs.io');
      endpoint.searchParams.set('output_format', outputFormat);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'audio/mpeg', 'xi-api-key': this.options.apiKey },
        body: JSON.stringify({ text: segment.text, model_id: modelId })
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 300);
        throw new Error(`ElevenLabs TTS failed (${response.status}): ${detail}`);
      }
      await writeFile(cachedPath, Buffer.from(await response.arrayBuffer()));
      await audioDuration(cachedPath);
    }
    await mkdir(dirname(segment.outputPath), { recursive: true });
    if (cachedPath !== segment.outputPath) await copyFile(cachedPath, segment.outputPath);
    return { path: segment.outputPath, durationSeconds: await audioDuration(segment.outputPath) };
  }
}

export class MacOSNarrationProvider implements NarrationProvider {
  constructor(private readonly options: MacOSNarrationOptions) {
    if (!options.voice) throw new Error('narration.macos.voice is required for local voiceover');
  }

  async synthesize(segment: NarrationSegment): Promise<{ path: string; durationSeconds: number }> {
    await mkdir(dirname(segment.outputPath), { recursive: true });
    const sourcePath = `${segment.outputPath}.aiff`;
    try {
      await execFileAsync('say', ['-v', this.options.voice, '-o', sourcePath, segment.text]);
      await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-i', sourcePath, '-c:a', 'libmp3lame', '-b:a', '192k', segment.outputPath]);
    } finally {
      await unlink(sourcePath).catch(() => undefined);
    }
    return { path: segment.outputPath, durationSeconds: await audioDuration(segment.outputPath) };
  }
}
