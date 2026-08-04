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

export interface EdlClip { id: string; sourcePath: string; purpose: string; title: string; segments: Segment[] }
export interface Edl {
  sources: Record<string, string>;
  ranges: Array<{ source: string; start: number; end: number; beat: string; note: string }>;
  grade: string | null;
  subtitles: string | null;
  overlays: never[];
}

export function buildEdl(clips: EdlClip[]): Edl {
  return {
    sources: Object.fromEntries(clips.map((clip) => [clip.id, clip.sourcePath])),
    ranges: clips.flatMap((clip) => clip.segments.map((segment) => ({ source: clip.id, start: segment.startSeconds, end: segment.endSeconds, beat: clip.purpose, note: clip.title }))),
    grade: null,
    subtitles: null,
    overlays: []
  };
}

export function outputCuts(clips: EdlClip[]): Array<{ outputSeconds: number; kind: 'trim' | 'scene'; sceneId: string }> {
  const cuts: Array<{ outputSeconds: number; kind: 'trim' | 'scene'; sceneId: string }> = [];
  let elapsed = 0;
  for (const [index, clip] of clips.entries()) {
    if (index > 0) cuts.push({ outputSeconds: Number(elapsed.toFixed(3)), kind: 'scene', sceneId: clip.id });
    for (const [position, segment] of clip.segments.entries()) {
      elapsed += segment.endSeconds - segment.startSeconds;
      if (position < clip.segments.length - 1) cuts.push({ outputSeconds: Number(elapsed.toFixed(3)), kind: 'trim', sceneId: clip.id });
    }
  }
  return cuts.sort((a, b) => a.outputSeconds - b.outputSeconds);
}

export async function mediaDuration(path: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path]);
  const value = Number(stdout.trim());
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Could not determine duration for ${path}`);
  return value;
}

export async function prepareClip(rawPath: string, trimmedPath: string, presentation: { loading: 'preserve' | 'cut'; maxStaticHoldMs: number }): Promise<{ path: string; durationSeconds: number; removedSeconds: number; segments: Segment[] }> {
  const durationSeconds = await mediaDuration(rawPath);
  if (presentation.loading === 'preserve') return { path: rawPath, durationSeconds, removedSeconds: 0, segments: [{ startSeconds: 0, endSeconds: durationSeconds }] };
  const maxHoldSeconds = presentation.maxStaticHoldMs / 1_000;
  const analysis = await analyzeVideo(rawPath, { staticWarnSeconds: maxHoldSeconds });
  const segments = trimSegments(durationSeconds, analysis.staticSpans, maxHoldSeconds);
  const keptSeconds = segments.reduce((total, segment) => total + (segment.endSeconds - segment.startSeconds), 0);
  if (keptSeconds >= durationSeconds - 0.05) return { path: rawPath, durationSeconds, removedSeconds: 0, segments: [{ startSeconds: 0, endSeconds: durationSeconds }] };
  await applyTrim(rawPath, trimmedPath, segments);
  const trimmedDuration = await mediaDuration(trimmedPath);
  return { path: trimmedPath, durationSeconds: trimmedDuration, removedSeconds: durationSeconds - trimmedDuration, segments };
}

export async function contactSheet(videoPath: string, outputPath: string, moments: number[], tileWidth = 480): Promise<number[]> {
  if (!moments.length) throw new Error('A contact sheet needs at least one moment');
  const ordered = [...moments].sort((a, b) => a - b);
  const columns = Math.min(4, ordered.length);
  const rows = Math.ceil(ordered.length / columns);
  const inputs = ordered.flatMap((moment) => ['-ss', moment.toFixed(3), '-i', videoPath]);
  const scaled = ordered.map((_, index) => `[${index}:v]trim=end_frame=1,setpts=PTS-STARTPTS,scale=${tileWidth}:-1,setsar=1[t${index}]`).join(';');
  const chain = `${scaled};${ordered.map((_, index) => `[t${index}]`).join('')}concat=n=${ordered.length}:v=1[grid];[grid]tile=${columns}x${rows}`;
  await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', chain, '-frames:v', '1', outputPath]);
  return ordered;
}

export async function applyTrim(inputPath: string, outputPath: string, segments: Segment[]): Promise<void> {
  const ranges = segments.map((segment) => `between(t,${segment.startSeconds},${segment.endSeconds})`).join('+');
  await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-i', inputPath, '-vf', `select='${ranges}',setpts=N/FRAME_RATE/TB`, '-an', outputPath]);
}
