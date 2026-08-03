import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { scanSensitiveText } from './safety.js';
import { EditorialReviewSchema, QualityReportSchema, TimelineSchema, type DemoConfig, type Scenario } from './schemas.js';
import { analyzeVideo } from './visual-analysis.js';

const execFileAsync = promisify(execFile);

interface EvaluateOptions {
  scenario: Scenario;
  config: DemoConfig;
  executionReport: { passed: boolean; scenes: Array<{ id: string; status: string; failure?: string }>; consoleErrors: string[]; failedRequests: unknown[]; artifacts: Record<string, string> };
  videoPath: string;
  timelinePath: string;
  outputPath: string;
  device: string;
  editorialReviewPath?: string;
  presentationMetadataPath?: string;
}

async function optionalJson(path: string): Promise<unknown | undefined> {
  return readFile(path, 'utf8').then(JSON.parse).catch(() => undefined);
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
  const gaps = timeline.events.slice(1).map((event, index) => Math.max(0, event.startedAtMs - timeline.events[index].endedAtMs));
  const maxGap = gaps.length ? Math.max(...gaps) : 0;
  const sensitiveFindings = scanSensitiveText(JSON.stringify({ scenario: options.scenario, timeline, execution: options.executionReport }));
  const omittedScenes = options.executionReport.scenes.filter((scene) => scene.status !== 'passed').map((scene) => ({ id: scene.id, reason: scene.failure ?? scene.status }));
  const expectsAudio = options.scenario.audio.policy !== 'silent';
  const technicalChecks = [
    { id: 'execution', passed: options.executionReport.passed, value: options.executionReport.passed, detail: 'All assertions and scenes passed' },
    { id: 'console-errors', passed: options.executionReport.consoleErrors.length === 0, value: options.executionReport.consoleErrors.length },
    { id: 'failed-requests', passed: options.executionReport.failedRequests.length === 0, value: options.executionReport.failedRequests.length },
    { id: 'locator-stability', passed: timeline.events.every((event) => event.state === 'passed'), value: timeline.events.filter((event) => event.state !== 'passed').length },
    { id: 'encoding', passed: stream.codec_name === 'h264' && stream.pix_fmt === 'yuv420p', value: `${stream.codec_name}/${stream.pix_fmt}` },
    { id: 'viewport', passed: width === profile.width && height === profile.height, value: `${width}x${height}` },
    { id: 'duration', passed: durationSeconds >= 1 && durationSeconds <= 180, value: durationSeconds },
    { id: 'dead-time', passed: maxGap <= 5_000, value: Math.round(maxGap) },
    { id: 'sensitive-information', passed: sensitiveFindings.length === 0, value: sensitiveFindings.length },
    { id: 'audio-policy', passed: expectsAudio ? Boolean(audioStream && maxAudioDb !== undefined && maxAudioDb > -60) : !audioStream, value: audioStream ? `${audioStream.codec_name}/${maxAudioDb ?? 'unknown'}dB` : 'no-audio', detail: `Expected policy: ${options.scenario.audio.policy}` },
  ];

  const thresholds = options.config.editorial.thresholds[options.scenario.outputType];
  const visual = await analyzeVideo(options.videoPath, { staticWarnSeconds: thresholds.staticWarnSeconds });
  const metadata = await optionalJson(options.presentationMetadataPath ?? join(dirname(options.videoPath), 'presentation-metadata.json')) as { scenes?: Array<{ viewport?: { width: number; height: number }; obstructions?: unknown[] }> } | undefined;
  const viewportRatios = metadata?.scenes?.map((scene) => scene.viewport ? (scene.viewport.width * scene.viewport.height) / (width * height) : 0) ?? [];
  const obstructions = metadata?.scenes?.reduce((sum, scene) => sum + (scene.obstructions?.length ?? 0), 0) ?? 0;
  const hasHook = options.scenario.scenes.some((scene) => scene.purpose === 'hook');
  const hasClose = options.scenario.scenes.some((scene) => scene.purpose === 'close' || scene.purpose === 'result');
  const montageRatio = options.scenario.scenes.filter((scene) => scene.purpose === 'montage').length / options.scenario.scenes.length;
  const editorialChecks = [
    { id: 'distinct-frames', passed: visual.distinctRatio >= thresholds.distinctFailRatio, value: Number(visual.distinctRatio.toFixed(3)), detail: `${visual.distinctFrames} visually distinct; ${visual.discardedFrames} discarded` },
    { id: 'repeated-static-sections', passed: visual.staticSpans.length < thresholds.repeatedStaticFailCount, value: visual.staticSpans.length, timestamps: visual.staticSpans.map((span) => span.startSeconds) },
    { id: 'hook', passed: options.scenario.outputType !== 'public-master' || hasHook, value: hasHook },
    { id: 'outcome-close', passed: options.scenario.outputType !== 'public-master' || hasClose, value: hasClose },
    { id: 'product-dominance', passed: viewportRatios.length === options.scenario.scenes.length && viewportRatios.every((ratio) => ratio >= 0.7), value: viewportRatios.length ? Number(Math.min(...viewportRatios).toFixed(3)) : 0 },
    { id: 'overlay-obstruction', passed: obstructions === 0, value: obstructions },
    { id: 'montage-ratio', passed: montageRatio <= thresholds.montageMaxRatio, value: Number(montageRatio.toFixed(3)) },
  ];
  const warnings = [
    { id: 'distinct-frames-warning', passed: visual.distinctRatio >= thresholds.distinctWarnRatio, value: Number(visual.distinctRatio.toFixed(3)) },
    ...visual.staticSpans.map((span, index) => ({ id: `static-span-${index + 1}`, passed: false, value: Number(span.durationSeconds.toFixed(2)), timestamps: [span.startSeconds], detail: 'Static section exceeds the warning threshold' })),
  ];
  const reviewValue = options.editorialReviewPath ? await optionalJson(options.editorialReviewPath) : undefined;
  const review = reviewValue ? EditorialReviewSchema.parse(reviewValue) : undefined;
  const agentReview = review ? { status: 'complete' as const, review } : { status: 'missing' as const, reason: 'Run the Watch skill against the actual final MP4 and provide its editorial review' };
  const technicalPassed = technicalChecks.every((check) => check.passed) && omittedScenes.length === 0;
  const editorialPassed = editorialChecks.every((check) => check.passed);
  const reviewAccepted = review?.verdict === 'accept' && review.score >= 7 && (options.scenario.audio.policy === 'silent' || review.transcriptStatus === 'available');
  const status = !technicalPassed || !editorialPassed || review?.verdict === 'reject' || (review && !reviewAccepted) ? 'rejected' : reviewAccepted ? 'accepted' : 'pending-agent-review';
  const report = QualityReportSchema.parse({
    version: 2, scenarioId: options.scenario.id, status, passed: status === 'accepted',
    technical: { passed: technicalPassed, checks: technicalChecks }, editorial: { passed: editorialPassed, checks: editorialChecks, warnings }, agentReview,
    sensitiveFindings, omittedScenes, encoding: { codec: stream.codec_name, width, height, durationSeconds, pixelFormat: stream.pix_fmt ?? '' },
  });
  await writeFile(options.outputPath, JSON.stringify(report, null, 2));
  return report;
}
