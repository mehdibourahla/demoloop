#!/usr/bin/env node
import { exec, spawn, type ChildProcess } from 'node:child_process';
import { parseArgs, promisify } from 'node:util';

const execAsync = promisify(exec);
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import YAML from 'yaml';
import { discoverProduct } from './discovery.js';
import { evaluateDemo } from './evaluate.js';
import { finalizeQuality } from './finalize.js';
import { planDemo, type PlanOptions } from './planner.js';
import { renderDemo } from './render.js';
import { browserContextOptions, executeAction, executeScenario } from './runner.js';
import { verifyTargets } from './verify.js';
import { chromium } from 'playwright';
import { ElevenLabsNarrationProvider, MacOSNarrationProvider, narrationPlan } from './narration.js';
import { scenarioDigest } from './receipt.js';
import { ConfigSchema, contractSchemas, EditorialReviewSchema, ExecutionReportSchema, ProductModelSchema, QualityReportSchema, ScenarioSchema, type DemoConfig, type Scenario } from './schemas.js';

const help = `demoloop <command> [scenario] [options]

Commands:
  discover                         Build an evidence-backed product model
  plan --mode full                 Generate a versioned scenario manifest
  verify <scenario>                Resolve every target against the running app
  rehearse <scenario>              Require two consecutive deterministic passes
  record <scenario>                Capture Playwright screencasts from a valid receipt
  render <scenario>                Compose and normalize an MP4 with Remotion and FFmpeg
  evaluate <scenario>              Write the machine-readable quality report
  finalize <scenario>              Apply a Watch editorial review to a quality report
  run <scenario>                   Rehearse, record, render, and evaluate
  validate <contract> <path>       Parse a document against its schema and print the digest

Options: --config <path> --device <desktop|mobile> --locale <locale> --audience <name> --duration-seconds <number> --audio <silent|music|voiceover|voiceover-and-music> --output <path>`;

const options = ['config', 'device', 'locale', 'audience', 'duration-seconds', 'audio', 'output', 'model', 'mode', 'journey', 'capability', 'actor', 'capabilities', 'receipt', 'report', 'video', 'review', 'quality'] as const;

function parse(args: string[]): { values: Record<string, string | undefined>; positionals: string[] } {
  const parsed = parseArgs({ args, options: Object.fromEntries(options.map((name) => [name, { type: 'string' as const }])), allowPositionals: true });
  return { values: parsed.values as Record<string, string | undefined>, positionals: parsed.positionals };
}

function numeric(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`--${name} must be a number, received ${value}`);
  return parsed;
}

export function exitCodeForQuality(report: { status: string; passed: boolean }): number {
  if (report.passed) return 0;
  return report.status === 'pending-agent-review' ? 3 : 1;
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

function scenarioForArgs(scenario: Scenario, values: Record<string, string | undefined>): Scenario {
  const audio = values.audio;
  return ScenarioSchema.parse({
    ...scenario,
    locale: values.locale ?? scenario.locale,
    audience: values.audience ?? scenario.audience,
    requestedDurationSeconds: numeric(values['duration-seconds'], 'duration-seconds') ?? scenario.requestedDurationSeconds,
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
    outputFormat: settings.outputFormat, cacheDirectory: join(config.output.directory, '.narration-cache'),
    voiceSettings: settings.voiceSettings, seed: settings.seed
  });
}

async function pacing(config: DemoConfig, scenario: Scenario) {
  return narrationPlan(scenario, narrationProvider(config, scenario), join(config.output.directory, '.narration-cache'));
}

async function rehearse(config: DemoConfig, scenario: Scenario, device: string, output?: string) {
  const narrationSeconds = await pacing(config, scenario);
  const cleanup = await ensureApp(config);
  try { return ExecutionReportSchema.parse(await executeScenario({ scenario, config, mode: 'rehearse', outputDirectory: output ?? pathsFor(config, scenario, device).rehearsal, device, narrationSeconds })); }
  finally { await cleanup(); }
}

async function record(config: DemoConfig, scenario: Scenario, device: string, receipt: string, output?: string) {
  const narrationSeconds = await pacing(config, scenario);
  const cleanup = await ensureApp(config);
  try { return ExecutionReportSchema.parse(await executeScenario({ scenario, config, mode: 'record', outputDirectory: output ?? pathsFor(config, scenario, device).recording, device, rehearsalReceiptPath: receipt, narrationSeconds })); }
  finally { await cleanup(); }
}

export async function runCli(args: string[]): Promise<number> {
  const command = args[0] ?? 'help';
  if (command === 'help' || command === '--help' || command === '-h') { console.log(help); return 0; }
  if (command === 'validate') {
    const kind = args[1] as keyof typeof contractSchemas;
    const schema = contractSchemas[kind];
    if (!schema) throw new Error(`validate requires a contract name: ${Object.keys(contractSchemas).join(', ')}`);
    if (!args[2]) throw new Error('validate requires a path to the document');
    const parsed = schema.safeParse(YAML.parse(await readFile(resolve(args[2]), 'utf8')));
    if (!parsed.success) {
      console.log(JSON.stringify({ valid: false, issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) }));
      return 1;
    }
    console.log(JSON.stringify({ valid: true, ...(kind === 'scenario' ? { digest: await scenarioDigest(parsed.data) } : {}) }));
    return 0;
  }
  const supported = new Set(['discover', 'plan', 'verify', 'rehearse', 'record', 'render', 'evaluate', 'finalize', 'run']);
  if (!supported.has(command)) throw new Error(`Unknown command: ${command}`);
  const { values, positionals } = parse(args.slice(1));
  const config = await loadConfig(values.config ?? 'demoloop.config.yaml');
  const device = values.device ?? 'desktop';
  const output = values.output;
  const requestedDurationSeconds = numeric(values['duration-seconds'], 'duration-seconds');

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
    const modelPath = values.model ?? join(config.output.directory, 'product-model.json');
    const model = ProductModelSchema.parse(JSON.parse(await readFile(modelPath, 'utf8')));
    const mode = (values.mode ?? 'full') as PlanOptions['mode'];
    const audioPolicy = (values.audio ?? 'silent') as Scenario['audio']['policy'];
    const result = planDemo(model, {
      mode,
      journeyId: values.journey,
      capabilityId: values.capability,
      actorId: values.actor,
      releaseCapabilityIds: values.capabilities?.split(',').filter(Boolean),
      locale: values.locale ?? 'en', audience: values.audience, requestedDurationSeconds,
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

  const reference = positionals[0];
  if (!reference) throw new Error(`${command} requires a scenario name or path`);
  const loaded = await loadScenario(reference);
  const scenario = scenarioForArgs(loaded.scenario, values);
  const paths = pathsFor(config, scenario, device);

  if (command === 'finalize') {
    const reviewPath = values.review;
    if (!reviewPath) throw new Error('finalize requires --review <absolute-json-path>');
    const qualityPath = values.quality ?? paths.quality;
    const videoPath = values.video ?? join(paths.render, `${scenario.id}-${device}.mp4`);
    const quality = QualityReportSchema.parse(JSON.parse(await readFile(qualityPath, 'utf8')));
    const review = EditorialReviewSchema.parse(JSON.parse(await readFile(resolve(reviewPath), 'utf8')));
    const finalized = await finalizeQuality(quality, review, { videoPath: resolve(videoPath), audioPolicy: scenario.audio.policy });
    const destination = output ?? qualityPath;
    await writeFile(destination, JSON.stringify(finalized, null, 2));
    console.log(destination);
    return finalized.passed ? 0 : 1;
  }

  if (command === 'verify') {
    const cleanup = await ensureApp(config);
    const browser = await chromium.launch({ headless: config.runtime.headless });
    try {
      const actor = scenario.actors[0];
      const context = await browser.newContext(browserContextOptions(config, device, actor, scenario.locale));
      const page = await context.newPage();
      if (scenario.preconditions.resetCommand) await execAsync(scenario.preconditions.resetCommand, { cwd: config.repository.root });
      if (scenario.preconditions.seedCommand) await execAsync(scenario.preconditions.seedCommand, { cwd: config.repository.root });
      await page.goto(config.app.url, { waitUntil: 'load' });
      const findings = await verifyTargets(page, scenario, Math.min(config.runtime.actionTimeoutMs, 5_000), async (action) => {
        const resolved = action.type === 'goto' ? { ...action, path: new URL(action.path, config.app.url).toString() } : action;
        await executeAction(page, resolved, false, undefined, undefined, 5_000);
      });
      const broken = findings.filter((finding) => finding.status !== 'resolved');
      for (const finding of broken) console.log(`${finding.status.padEnd(9)} ${finding.sceneId}[${finding.actionIndex}] ${finding.label} (${finding.matches} matches)`);
      console.log(`${findings.length - broken.length}/${findings.length} targets resolved while walking the scenario`);
      return broken.length ? 1 : 0;
    } finally { await browser.close(); await cleanup(); }
  }

  if (command === 'rehearse') {
    const report = await rehearse(config, scenario, device, output);
    console.log(report.artifacts.report);
    return report.passed ? 0 : 1;
  }
  if (command === 'record') {
    const report = await record(config, scenario, device, values.receipt ?? join(paths.rehearsal, 'execution-report.json'), output);
    console.log(report.artifacts.report);
    return report.passed ? 0 : 1;
  }
  if (command === 'run') {
    const narrationSeconds = await pacing(config, scenario);
    const cleanup = await ensureApp(config);
    try {
      const rehearsalReport = ExecutionReportSchema.parse(await executeScenario({ scenario, config, mode: 'rehearse', outputDirectory: paths.rehearsal, device, narrationSeconds }));
      if (!rehearsalReport.passed) return 1;
      const freshRecording = ExecutionReportSchema.parse(await executeScenario({ scenario, config, mode: 'record', outputDirectory: paths.recording, device, rehearsalReceiptPath: rehearsalReport.artifacts.report, narrationSeconds }));
      if (!freshRecording.passed) return 1;
      const freshVideo = await renderDemo({ scenario, config, executionReport: freshRecording, outputDirectory: paths.render, device, narrationProvider: narrationProvider(config, scenario) });
      const quality = QualityReportSchema.parse(await evaluateDemo({ scenario, config, executionReport: freshRecording, videoPath: freshVideo, timelinePath: freshRecording.artifacts.timeline, outputPath: paths.quality, device }));
      console.log(JSON.stringify({ video: freshVideo, execution: freshRecording.artifacts.report, quality: paths.quality }));
      return exitCodeForQuality(quality);
    } finally { await cleanup(); }
  }
  const recordingReportPath = values.report ?? join(paths.recording, 'execution-report.json');
  const recordingReport = ExecutionReportSchema.parse(JSON.parse(await readFile(recordingReportPath, 'utf8')));
  if (command === 'render') {
    console.log(await renderDemo({ scenario, config, executionReport: recordingReport, outputDirectory: output ?? paths.render, device, narrationProvider: narrationProvider(config, scenario) }));
    return 0;
  }
  const videoPath = values.video ?? join(paths.render, `${scenario.id}-${device}.mp4`);
  if (command === 'evaluate') {
    const report = await evaluateDemo({ scenario, config, executionReport: recordingReport, videoPath, timelinePath: recordingReport.artifacts.timeline, outputPath: output ?? paths.quality, device });
    console.log(output ?? paths.quality);
    return exitCodeForQuality(QualityReportSchema.parse(report));
  }
  throw new Error(`Unknown command: ${command}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
