import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SAMPLE_WIDTH = 128;
const SAMPLE_HEIGHT = 128;
const PIXEL_DELTA = 10;
const FRAME_BYTES = SAMPLE_WIDTH * SAMPLE_HEIGHT;

export interface VisualAnalysis {
  sampledFrames: number;
  distinctFrames: number;
  discardedFrames: number;
  distinctRatio: number;
  samples: Array<{ timestampSeconds: number; changeRatio: number; luminance: number; contrast: number }>;
  staticSpans: Array<{ startSeconds: number; endSeconds: number; durationSeconds: number }>;
}

export async function analyzeVideo(videoPath: string, options: { samplesPerSecond?: number; changeThreshold?: number; staticWarnSeconds?: number } = {}): Promise<VisualAnalysis> {
  const samplesPerSecond = options.samplesPerSecond ?? 2;
  const changeThreshold = options.changeThreshold ?? 0.0015;
  const staticWarnSeconds = options.staticWarnSeconds ?? 3;
  const { stdout } = await execFileAsync('ffmpeg', ['-loglevel', 'error', '-i', videoPath, '-vf', `fps=${samplesPerSecond},scale=${SAMPLE_WIDTH}:${SAMPLE_HEIGHT}:flags=area,format=gray`, '-f', 'rawvideo', 'pipe:1'], { encoding: 'buffer', maxBuffer: 128 * 1024 * 1024 });
  const frames: Buffer[] = [];
  for (let offset = 0; offset + FRAME_BYTES <= stdout.length; offset += FRAME_BYTES) frames.push(stdout.subarray(offset, offset + FRAME_BYTES));
  if (!frames.length) throw new Error(`No frames could be extracted from ${videoPath}`);
  const samples = frames.map((frame, index) => {
    let sum = 0;
    for (const value of frame) sum += value;
    const luminance = sum / (FRAME_BYTES * 255);
    let variance = 0;
    for (const value of frame) variance += ((value / 255) - luminance) ** 2;
    let changedPixels = 0;
    if (index > 0) for (let pixel = 0; pixel < FRAME_BYTES; pixel += 1) if (Math.abs(frame[pixel] - frames[index - 1][pixel]) > PIXEL_DELTA) changedPixels += 1;
    return { timestampSeconds: index / samplesPerSecond, changeRatio: index === 0 ? 1 : changedPixels / FRAME_BYTES, luminance, contrast: Math.sqrt(variance / FRAME_BYTES) };
  });
  const changed = samples.map((sample, index) => index === 0 || sample.changeRatio >= changeThreshold);
  const staticSpans: VisualAnalysis['staticSpans'] = [];
  let staticStart: number | undefined;
  for (let index = 1; index < changed.length; index += 1) {
    if (!changed[index] && staticStart === undefined) staticStart = (index - 1) / samplesPerSecond;
    if ((changed[index] || index === changed.length - 1) && staticStart !== undefined) {
      const endSeconds = (changed[index] ? index - 1 : index) / samplesPerSecond;
      if (endSeconds - staticStart >= staticWarnSeconds) staticSpans.push({ startSeconds: staticStart, endSeconds, durationSeconds: endSeconds - staticStart });
      staticStart = undefined;
    }
  }
  const distinctFrames = changed.filter(Boolean).length;
  return { sampledFrames: frames.length, distinctFrames, discardedFrames: frames.length - distinctFrames, distinctRatio: distinctFrames / frames.length, samples, staticSpans };
}
