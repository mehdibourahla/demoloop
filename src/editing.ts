import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { analyzeVideo, type VisualAnalysis } from './visual-analysis.js';

const execFileAsync = promisify(execFile);

export interface Segment { startSeconds: number; endSeconds: number }

export function trimSegments(durationSeconds: number, staticSpans: VisualAnalysis['staticSpans'], maxHoldSeconds: number): Segment[] {
  const drops = staticSpans
    .filter((span) => span.durationSeconds > maxHoldSeconds)
    .map((span) => ({ startSeconds: span.startSeconds + maxHoldSeconds, endSeconds: Math.min(span.endSeconds, durationSeconds) }))
    .filter((drop) => drop.endSeconds > drop.startSeconds)
    .sort((a, b) => a.startSeconds - b.startSeconds);
  const segments: Segment[] = [];
  let cursor = 0;
  for (const drop of drops) {
    if (drop.startSeconds > cursor) segments.push({ startSeconds: cursor, endSeconds: drop.startSeconds });
    cursor = Math.max(cursor, drop.endSeconds);
  }
  if (cursor < durationSeconds) segments.push({ startSeconds: cursor, endSeconds: durationSeconds });
  return segments;
}

export async function mediaDuration(path: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path]);
  const value = Number(stdout.trim());
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Could not determine duration for ${path}`);
  return value;
}

export async function prepareClip(rawPath: string, trimmedPath: string, presentation: { loading: 'preserve' | 'cut'; maxStaticHoldMs: number }): Promise<{ path: string; durationSeconds: number; removedSeconds: number }> {
  const durationSeconds = await mediaDuration(rawPath);
  if (presentation.loading === 'preserve') return { path: rawPath, durationSeconds, removedSeconds: 0 };
  const maxHoldSeconds = presentation.maxStaticHoldMs / 1_000;
  const analysis = await analyzeVideo(rawPath, { staticWarnSeconds: maxHoldSeconds });
  const segments = trimSegments(durationSeconds, analysis.staticSpans, maxHoldSeconds);
  const keptSeconds = segments.reduce((total, segment) => total + (segment.endSeconds - segment.startSeconds), 0);
  if (keptSeconds >= durationSeconds - 0.05) return { path: rawPath, durationSeconds, removedSeconds: 0 };
  await applyTrim(rawPath, trimmedPath, segments);
  const trimmedDuration = await mediaDuration(trimmedPath);
  return { path: trimmedPath, durationSeconds: trimmedDuration, removedSeconds: durationSeconds - trimmedDuration };
}

export async function applyTrim(inputPath: string, outputPath: string, segments: Segment[]): Promise<void> {
  const ranges = segments.map((segment) => `between(t,${segment.startSeconds},${segment.endSeconds})`).join('+');
  await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-i', inputPath, '-vf', `select='${ranges}',setpts=N/FRAME_RATE/TB`, '-an', outputPath]);
}
