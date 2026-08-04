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

export interface ExcludedRegion { x: number; y: number; width: number; height: number }

function measuredPixels(regions: ExcludedRegion[]): boolean[] {
  const measured = new Array<boolean>(FRAME_BYTES).fill(true);
  for (const region of regions) {
    const left = Math.max(0, Math.floor(region.x * SAMPLE_WIDTH));
    const right = Math.min(SAMPLE_WIDTH, Math.ceil((region.x + region.width) * SAMPLE_WIDTH));
    const top = Math.max(0, Math.floor(region.y * SAMPLE_HEIGHT));
    const bottom = Math.min(SAMPLE_HEIGHT, Math.ceil((region.y + region.height) * SAMPLE_HEIGHT));
    for (let row = top; row < bottom; row += 1) for (let column = left; column < right; column += 1) measured[row * SAMPLE_WIDTH + column] = false;
  }
  return measured;
}

export async function analyzeVideo(videoPath: string, options: { samplesPerSecond?: number; changeThreshold?: number; staticWarnSeconds?: number; excludeRegions?: ExcludedRegion[] } = {}): Promise<VisualAnalysis> {
  const samplesPerSecond = options.samplesPerSecond ?? 2;
  const changeThreshold = options.changeThreshold ?? 0.0015;
  const staticWarnSeconds = options.staticWarnSeconds ?? 3;
  const { stdout } = await execFileAsync('ffmpeg', ['-loglevel', 'error', '-i', videoPath, '-vf', `fps=${samplesPerSecond},scale=${SAMPLE_WIDTH}:${SAMPLE_HEIGHT}:flags=area,format=gray`, '-f', 'rawvideo', 'pipe:1'], { encoding: 'buffer', maxBuffer: 128 * 1024 * 1024 });
  const frames: Buffer[] = [];
  for (let offset = 0; offset + FRAME_BYTES <= stdout.length; offset += FRAME_BYTES) frames.push(stdout.subarray(offset, offset + FRAME_BYTES));
  if (!frames.length) throw new Error(`No frames could be extracted from ${videoPath}`);
  const measured = measuredPixels(options.excludeRegions ?? []);
  const measuredCount = measured.reduce((total, include) => total + (include ? 1 : 0), 0) || FRAME_BYTES;
  const samples = frames.map((frame, index) => {
    let sum = 0;
    for (let pixel = 0; pixel < FRAME_BYTES; pixel += 1) if (measured[pixel]) sum += frame[pixel];
    const luminance = sum / (measuredCount * 255);
    let variance = 0;
    for (let pixel = 0; pixel < FRAME_BYTES; pixel += 1) if (measured[pixel]) variance += ((frame[pixel] / 255) - luminance) ** 2;
    let changedPixels = 0;
    if (index > 0) for (let pixel = 0; pixel < FRAME_BYTES; pixel += 1) if (measured[pixel] && Math.abs(frame[pixel] - frames[index - 1][pixel]) > PIXEL_DELTA) changedPixels += 1;
    return { timestampSeconds: index / samplesPerSecond, changeRatio: index === 0 ? 1 : changedPixels / measuredCount, luminance, contrast: Math.sqrt(variance / measuredCount) };
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
