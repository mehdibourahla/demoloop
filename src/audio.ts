import { stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type { Scenario } from './schemas.js';

export interface ResolvedAudioPolicy {
  voiceover: boolean;
  musicPath?: string;
  musicLevel?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
}

export async function resolveAudioPolicy(audio: Scenario['audio']): Promise<ResolvedAudioPolicy> {
  const voiceover = audio.policy === 'voiceover' || audio.policy === 'voiceover-and-music';
  if (audio.policy === 'silent' || audio.policy === 'voiceover') return { voiceover };
  const path = audio.music?.path;
  if (!path || !isAbsolute(path) || /^https?:\/\//i.test(path)) throw new Error('Music must be a real local absolute asset path');
  const asset = await stat(path).catch(() => undefined);
  if (!asset?.isFile()) throw new Error(`Music asset does not exist: ${path}`);
  return { voiceover, musicPath: path, musicLevel: audio.music!.level, fadeInMs: audio.music!.fadeInMs, fadeOutMs: audio.music!.fadeOutMs };
}
