import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface SubtitleCue { text: string; startSeconds: number; endSeconds: number }
export interface NarratedScene { text: string; startSeconds: number; durationSeconds: number }

const MAX_CUE_CHARS = 84;

function packed(parts: string[], maxChars: number): string[] {
  const packedParts: string[] = [];
  for (const part of parts) {
    const current = packedParts.at(-1);
    if (current && `${current} ${part}`.length <= maxChars) packedParts[packedParts.length - 1] = `${current} ${part}`;
    else packedParts.push(part);
  }
  return packedParts;
}

function splitLine(text: string, maxChars: number): string[] {
  const sentences = text.split(/(?<=[.!?…])\s+/).filter(Boolean);
  return sentences.flatMap((sentence) => {
    if (sentence.length <= maxChars) return [sentence];
    const clauses = packed(sentence.split(/(?<=[,;:])\s+/).filter(Boolean), maxChars);
    return clauses.flatMap((clause) => (clause.length <= maxChars ? [clause] : packed(clause.split(/\s+/), maxChars)));
  });
}

export function subtitleCues(scenes: NarratedScene[], maxChars = MAX_CUE_CHARS): SubtitleCue[] {
  return scenes.flatMap((scene) => {
    const lines = scene.text.trim() ? splitLine(scene.text.trim(), maxChars) : [];
    const totalChars = lines.reduce((sum, line) => sum + line.length, 0);
    if (!totalChars) return [];
    let elapsed = 0;
    return lines.map((line) => {
      const startSeconds = scene.startSeconds + (elapsed / totalChars) * scene.durationSeconds;
      elapsed += line.length;
      return { text: line, startSeconds, endSeconds: scene.startSeconds + (elapsed / totalChars) * scene.durationSeconds };
    });
  });
}

function stamp(seconds: number): string {
  const milliseconds = Math.round(seconds * 1_000);
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  return `${pad(Math.floor(milliseconds / 3_600_000))}:${pad(Math.floor(milliseconds / 60_000) % 60)}:${pad(Math.floor(milliseconds / 1_000) % 60)},${pad(milliseconds % 1_000, 3)}`;
}

export function formatSrt(cues: SubtitleCue[]): string {
  return cues.map((cue, index) => `${index + 1}\n${stamp(cue.startSeconds)} --> ${stamp(cue.endSeconds)}\n${cue.text}\n`).join('\n');
}

export async function supportsBurnedSubtitles(): Promise<boolean> {
  const { stdout } = await execFileAsync('ffmpeg', ['-hide_banner', '-filters']);
  return /^\s*\S+\s+subtitles\s/m.test(stdout);
}
