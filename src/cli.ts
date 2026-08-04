#!/usr/bin/env node
import { spawn, type ChildProcess } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import YAML from 'yaml';
import { discoverProduct } from './discovery.js';
import { evaluateDemo } from './evaluate.js';
import { finalizeQuality } from './finalize.js';
import { planDemo, type PlanOptions } from './planner.js';
import { renderDemo } from './render.js';
import { executeScenario } from './runner.js';
import { ElevenLabsNarrationProvider, MacOSNarrationProvider } from './narration.js';
import { ConfigSchema, EditorialReviewSchema, ExecutionReportSchema, ProductModelSchema, QualityReportSchema, ScenarioSchema, type DemoConfig, type Scenario } from './schemas.js';

const help = `product-demo <command> [scenario] [options]

Commands:
  discover                         Build an evidence-backed product model
  plan --mode full                 Generate a versioned scenario manifest
  rehearse <scenario>              Require two consecutive deterministic passes
  record <scenario>                Capture Playwright screencasts from a valid receipt
  render <scenario>                Compose and normalize an MP4 with Remotion and FFmpeg
  evaluate <scenario>              Write the machine-readable quality report
  finalize <scenario>              Apply a Watch editorial review to a quality report
  run <scenario>                   Rehearse, record, render, and evaluate

Options: --config <path> --device <desktop|mobile> --locale <locale> --audience <name> --duration-seconds <number> --audio <silent|music|voiceover|voiceover-and-music> --output <path>`;

function flag(args: string[], name: string, fallback?: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
}

function positional(args: string[]): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index].startsWith('--')) index += 1;
    else values.push(args[index]);
  }
  return values;
}

async function loadConfig(path: string): Promise<DemoConfig> {
  const absolute = resolve(path);
  const parsed = ConfigSchema.parse(YAML.parse(await readFile(absolute, 'utf8')));
  return { ...parsed, app: { ...parsed.app, commandCwd: parsed.app.commandCwd ? resolve(dirname(absolute), parsed.app.commandCwd) : undefined }, repository: { root: resolve(dirname(absolute), parsed.repository.root) }, output: { directory: resolve(dirname(absolute), parsed.output.directory) } };
}

async function existingPath(paths: string[]): Promise<string> {
  for (const path of paths) {
    try { await access(path); return path; } catch {}
  }
  throw new Error(`File not found: ${paths.join(' or ')}`);
}

async function loadScenario(reference: string): Promise<{ scenario: Scenario; path: string }> {
  const path = await existingPath([resolve(reference), resolve('scenarios', `${reference}.yaml`), resolve('examples', `${reference}.yaml`)]);
  return { scenario: ScenarioSchema.parse(YAML.parse(await readFile(path, 'utf8'))), path };
}

export async function ensureApp(config: DemoConfig): Promise<() => Promise<void>> {
  const healthcheck = config.app.healthcheck ?? config.app.url;
  try { if ((await fetch(healthcheck)).ok) return async () => {}; } catch {}
  if (!config.app.startCommand) throw new Error(`Application is unreachable at ${healthcheck} and no startCommand is configured`);
  const child: ChildProcess = spawn(config.app.startCommand, { cwd: config.app.commandCwd ?? config.repository.root, shell: true, stdio: 'inherit', detached: true });
  const exited = new Promise<void>((resolveExit) => child.once('exit', () => resolveExit()));
  const stop = async () => {
    if (child.exitCode !== null || child.pid === undefined) return;
    try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
    const escalation = setTimeout(() => { try { process.kill(-child.pid!, 'SIGKILL'); } catch {} }, 5_000);
    await exited;
    clearTimeout(escalation);
  };
  const deadline = Date.now() + config.runtime.startTimeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Application command exited with code ${child.exitCode}`);
    try { if ((await fetch(healthcheck)).ok) return stop; } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  await stop();
  throw new Error(`Application did not become ready at ${healthcheck} within ${config.runtime.startTimeoutMs}ms`);
}

function scenarioForArgs(scenario: Scenario, args: string[]): Scenario {
  const duration = flag(args, 'duration-seconds');
  const audio = flag(args, 'audio');
  return ScenarioSchema.parse({
    ...scenario,
    locale: flag(args, 'locale', scenario.locale),
    audience: flag(args, 'audience', scenario.audience),
    requestedDurationSeconds: duration ? Number(duration) : scenario.requestedDurationSeconds,
    audio: audio ? { ...scenario.audio, policy: audio } : scenario.audio
  });
}

function pathsFor(config: DemoConfig, scenario: Scenario, device: string) {
  const base = join(config.output.directory, scenario.id, device);
  return { base, rehearsal: join(base, 'rehearsal'), recording: join(base, 'recording'), render: join(base, 'render'), quality: join(base, 'quality-report.json') };
}

export function narrationProvider(config: DemoConfig, scenario: Scenario) {
  if (scenario.audio.policy !== 'voiceover' && scenario.audio.policy !== 'voiceover-and-music') return undefined;
  if (config.narration.provider === 'macos') return new MacOSNarrationProvider(config.narration.macos);
  if (config.narration.provider !== 'elevenlabs') throw new Error('Voiceover requires a configured narration provider');
  const settings = config.narration.elevenlabs;
  return new ElevenLabsNarrationProvider({
    apiKey: process.env[settings.apiKeyEnv] ?? '', voiceId: settings.voiceId ?? '', modelId: settings.modelId,
    outputFormat: settings.outputFormat, cacheDirectory: join(config.output.directory, '.narration-cache')
  });
}

async function rehearse(config: DemoConfig, scenario: Scenario, device: string, output?: string) {
  const cleanup = await ensureApp(config);
  try { return ExecutionReportSchema.parse(await executeScenario({ scenario, config, mode: 'rehearse', outputDirectory: output ?? pathsFor(config, scenario, device).rehearsal, device })); }
  finally { await cleanup(); }
}

async function record(config: DemoConfig, scenario: Scenario, device: string, receipt: string, output?: string) {
  const cleanup = await ensureApp(config);
  try { return ExecutionReportSchema.parse(await executeScenario({ scenario, config, mode: 'record', outputDirectory: output ?? pathsFor(config, scenario, device).recording, device, rehearsalReceiptPath: receipt })); }
  finally { await cleanup(); }
}

export async function runCli(args: string[]): Promise<number> {
  const command = args[0] ?? 'help';
  if (command === 'help' || command === '--help' || command === '-h') { console.log(help); return 0; }
  const supported = new Set(['discover', 'plan', 'rehearse', 'record', 'render', 'evaluate', 'finalize', 'run']);
  if (!supported.has(command)) throw new Error(`Unknown command: ${command}`);
  const config = await loadConfig(flag(args, 'config', 'product-demo.config.yaml')!);
  const device = flag(args, 'device', 'desktop')!;
  const output = flag(args, 'output');

  if (command === 'discover') {
    const cleanup = await ensureApp(config);
    try {
      const destination = output ?? join(config.output.directory, 'product-model.json');
      const model = await discoverProduct(config.repository.root, config.app.url, join(config.output.directory, 'discovery'));
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, JSON.stringify(model, null, 2));
      console.log(destination);
      return 0;
    } finally { await cleanup(); }
  }

  if (command === 'plan') {
    const modelPath = flag(args, 'model', join(config.output.directory, 'product-model.json'))!;
    const model = ProductModelSchema.parse(JSON.parse(await readFile(modelPath, 'utf8')));
    const mode = flag(args, 'mode', 'full') as PlanOptions['mode'];
    const duration = flag(args, 'duration-seconds');
    const audioPolicy = flag(args, 'audio', 'silent') as Scenario['audio']['policy'];
    const result = planDemo(model, {
      mode,
      journeyId: flag(args, 'journey'),
      capabilityId: flag(args, 'capability'),
      actorId: flag(args, 'actor'),
      releaseCapabilityIds: flag(args, 'capabilities')?.split(',').filter(Boolean),
      locale: flag(args, 'locale', 'en'), audience: flag(args, 'audience'), requestedDurationSeconds: duration ? Number(duration) : undefined,
      audio: { policy: audioPolicy }
    });
    const destination = output ?? join(config.output.directory, 'plan');
    await mkdir(destination, { recursive: true });
    if (result.status === 'needs-authoring') {
      const path = join(destination, 'needs-authoring.json');
      await writeFile(path, JSON.stringify(result, null, 2));
      console.log(path);
      return 2;
    }
    for (const scenario of result.outputs) await writeFile(join(destination, `${scenario.id}.yaml`), YAML.stringify(scenario));
    await writeFile(join(destination, 'coverage-report.json'), JSON.stringify(result.coverage, null, 2));
    await writeFile(join(destination, 'omissions.json'), JSON.stringify(result.omissions, null, 2));
    await writeFile(join(destination, 'plan-result.json'), JSON.stringify(result, null, 2));
    console.log(destination);
    return 0;
  }

  const reference = positional(args.slice(1))[0];
  if (!reference) throw new Error(`${command} requires a scenario name or path`);
  const loaded = await loadScenario(reference);
  const scenario = scenarioForArgs(loaded.scenario, args);
  const paths = pathsFor(config, scenario, device);

  if (command === 'finalize') {
    const reviewPath = flag(args, 'review');
    if (!reviewPath) throw new Error('finalize requires --review <absolute-json-path>');
    const qualityPath = flag(args, 'quality', paths.quality)!;
    const videoPath = flag(args, 'video', join(paths.render, `${scenario.id}-${device}.mp4`))!;
    const quality = QualityReportSchema.parse(JSON.parse(await readFile(qualityPath, 'utf8')));
    const review = EditorialReviewSchema.parse(JSON.parse(await readFile(resolve(reviewPath), 'utf8')));
    const finalized = await finalizeQuality(quality, review, { videoPath: resolve(videoPath), audioPolicy: scenario.audio.policy });
    const destination = output ?? qualityPath;
    await writeFile(destination, JSON.stringify(finalized, null, 2));
    console.log(destination);
    return finalized.passed ? 0 : 1;
  }

  if (command === 'rehearse') {
    const report = await rehearse(config, scenario, device, output);
    console.log(report.artifacts.report);
    return report.passed ? 0 : 1;
  }
  if (command === 'record') {
    const report = await record(config, scenario, device, flag(args, 'receipt', join(paths.rehearsal, 'execution-report.json'))!, output);
    console.log(report.artifacts.report);
    return report.passed ? 0 : 1;
  }
  if (command === 'run') {
    const cleanup = await ensureApp(config);
    try {
      const rehearsalReport = ExecutionReportSchema.parse(await executeScenario({ scenario, config, mode: 'rehearse', outputDirectory: paths.rehearsal, device }));
      if (!rehearsalReport.passed) return 1;
      const freshRecording = ExecutionReportSchema.parse(await executeScenario({ scenario, config, mode: 'record', outputDirectory: paths.recording, device, rehearsalReceiptPath: rehearsalReport.artifacts.report }));
      if (!freshRecording.passed) return 1;
      const freshVideo = await renderDemo({ scenario, config, executionReport: freshRecording, outputDirectory: paths.render, device, narrationProvider: narrationProvider(config, scenario) });
      const quality = QualityReportSchema.parse(await evaluateDemo({ scenario, config, executionReport: freshRecording, videoPath: freshVideo, timelinePath: freshRecording.artifacts.timeline, outputPath: paths.quality, device }));
      console.log(JSON.stringify({ video: freshVideo, execution: freshRecording.artifacts.report, quality: paths.quality }));
      return quality.passed ? 0 : 1;
    } finally { await cleanup(); }
  }
  const recordingReportPath = flag(args, 'report', join(paths.recording, 'execution-report.json'))!;
  const recordingReport = ExecutionReportSchema.parse(JSON.parse(await readFile(recordingReportPath, 'utf8')));
  if (command === 'render') {
    console.log(await renderDemo({ scenario, config, executionReport: recordingReport, outputDirectory: output ?? paths.render, device, narrationProvider: narrationProvider(config, scenario) }));
    return 0;
  }
  const videoPath = flag(args, 'video', join(paths.render, `${scenario.id}-${device}.mp4`))!;
  if (command === 'evaluate') {
    const report = await evaluateDemo({ scenario, config, executionReport: recordingReport, videoPath, timelinePath: recordingReport.artifacts.timeline, outputPath: output ?? paths.quality, device });
    console.log(output ?? paths.quality);
    return QualityReportSchema.parse(report).passed ? 0 : 1;
  }
  throw new Error(`Unknown command: ${command}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
