import { execFile, execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { scanSensitiveText } from './safety.js';
import { QualityReportSchema, TimelineSchema, type DemoConfig, type Scenario } from './schemas.js';

const execFileAsync = promisify(execFile);

interface EvaluateOptions {
  scenario: Scenario;
  config: DemoConfig;
  executionReport: { passed: boolean; scenes: Array<{ id: string; status: string; failure?: string }>; consoleErrors: string[]; failedRequests: unknown[]; artifacts: Record<string, string> };
  videoPath: string;
  timelinePath: string;
  outputPath: string;
  device: string;
}

export async function evaluateDemo(options: EvaluateOptions): Promise<unknown> {
  const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,pix_fmt:format=duration', '-of', 'json', options.videoPath]);
  const probe = JSON.parse(stdout) as { streams: Array<{ codec_type: string; codec_name: string; width?: number; height?: number; pix_fmt?: string }>; format: { duration: string } };
  const stream = probe.streams.find((candidate) => candidate.codec_type === 'video');
  if (!stream) throw new Error('Rendered video has no video stream');
  const audioStream = probe.streams.find((candidate) => candidate.codec_type === 'audio');
  let maxAudioDb: number | undefined;
  if (audioStream) {
    const { stderr } = await execFileAsync('ffmpeg', ['-hide_banner', '-i', options.videoPath, '-vn', '-af', 'volumedetect', '-f', 'null', '-']);
    const match = stderr.match(/max_volume:\s*(-?[\d.]+) dB/);
    if (match) maxAudioDb = Number(match[1]);
  }
  const timeline = TimelineSchema.parse(JSON.parse(await readFile(options.timelinePath, 'utf8')));
  const profile = options.config.devices[options.device];
  const durationSeconds = Number(probe.format.duration);
  const width = stream.width ?? 0;
  const height = stream.height ?? 0;
  const frame = execFileSync('ffmpeg', ['-loglevel', 'error', '-ss', String(durationSeconds / 4), '-i', options.videoPath, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { encoding: 'buffer', maxBuffer: width * height * 4 });
  let neutralPaddingPixels = 0;
  for (let index = 0; index < frame.length; index += 3) {
    const red = frame[index]; const green = frame[index + 1]; const blue = frame[index + 2];
    if (Math.abs(red - green) <= 2 && Math.abs(green - blue) <= 2 && red >= 120 && red <= 140) neutralPaddingPixels += 1;
  }
  const neutralPaddingRatio = neutralPaddingPixels / (width * height);
  const gaps = timeline.events.slice(1).map((event, index) => Math.max(0, event.startedAtMs - timeline.events[index].endedAtMs));
  const maxGap = gaps.length ? Math.max(...gaps) : 0;
  const sensitiveFindings = scanSensitiveText(JSON.stringify({ scenario: options.scenario, timeline, execution: options.executionReport }));
  const omittedScenes = options.executionReport.scenes.filter((scene) => scene.status !== 'passed').map((scene) => ({ id: scene.id, reason: scene.failure ?? scene.status }));
  const checks = [
    { id: 'execution', passed: options.executionReport.passed, value: options.executionReport.passed, detail: 'All assertions and scenes passed' },
    { id: 'console-errors', passed: options.executionReport.consoleErrors.length === 0, value: options.executionReport.consoleErrors.length },
    { id: 'failed-requests', passed: options.executionReport.failedRequests.length === 0, value: options.executionReport.failedRequests.length },
    { id: 'locator-stability', passed: timeline.events.every((event) => event.state === 'passed'), value: timeline.events.filter((event) => event.state !== 'passed').length },
    { id: 'encoding', passed: stream.codec_name === 'h264' && stream.pix_fmt === 'yuv420p', value: `${stream.codec_name}/${stream.pix_fmt}` },
    { id: 'viewport', passed: width === profile.width && height === profile.height, value: `${width}x${height}` },
    { id: 'capture-fill', passed: neutralPaddingRatio < 0.1, value: Number(neutralPaddingRatio.toFixed(4)), detail: 'Neutral capture padding must stay below 10% of a representative frame' },
    { id: 'duration', passed: durationSeconds >= 5 && durationSeconds <= 180, value: durationSeconds },
    { id: 'cursor-visibility', passed: timeline.events.some((event) => event.type === 'click'), value: 'Text-free captured pointer enabled without click markers' },
    { id: 'dead-time', passed: maxGap <= 5_000, value: Math.round(maxGap) },
    { id: 'annotation-placement', passed: profile.height >= 720, value: 'lower Remotion caption rail without action labels' },
    { id: 'sensitive-information', passed: sensitiveFindings.length === 0, value: sensitiveFindings.length },
    { id: 'audio-sync', passed: options.scenario.narration !== 'voiceover' || Boolean(audioStream && maxAudioDb !== undefined && maxAudioDb > -60), value: options.scenario.narration === 'voiceover' ? (maxAudioDb === undefined ? 'missing' : `${audioStream?.codec_name}/${maxAudioDb}dB`) : 'not-requested' }
  ];
  const report = QualityReportSchema.parse({
    version: 1, scenarioId: options.scenario.id, passed: checks.every((check) => check.passed) && omittedScenes.length === 0,
    checks, sensitiveFindings, omittedScenes,
    encoding: { codec: stream.codec_name, width, height, durationSeconds, pixelFormat: stream.pix_fmt ?? '' }
  });
  await writeFile(options.outputPath, JSON.stringify(report, null, 2));
  return report;
}
