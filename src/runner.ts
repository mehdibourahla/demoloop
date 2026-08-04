import { exec } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';
import { chromium, devices, type BrowserContext, type Locator, type Page } from 'playwright';
import { actionDelay, cursorMotion, scrollMotion, type Point } from './timing.js';
import { assertSafeTarget } from './safety.js';
import { canRecord, scenarioDigest } from './receipt.js';
import { ExecutionReportSchema, TimelineSchema, type Action, type DemoConfig, type Scenario, type Target, type TimelineEvent } from './schemas.js';

const execAsync = promisify(exec);

export interface ExecuteOptions { scenario: Scenario; config: DemoConfig; mode: 'rehearse' | 'record'; outputDirectory: string; device: string; rehearsalReceiptPath?: string }

export function isIgnorableRequestFailure(errorText: string | undefined): boolean {
  return errorText === 'net::ERR_ABORTED';
}

export function locatorFor(page: Page, target: Target): Locator {
  if (target.by === 'label') return page.getByLabel(target.value, { exact: true });
  if (target.by === 'testId') return page.getByTestId(target.value);
  if (target.by === 'text') return page.getByText(target.value, { exact: true }).first();
  if (target.by === 'textPattern') return page.getByText(new RegExp(target.pattern, 'i')).first();
  if (target.by === 'roleAny') {
    const alternatives = target.values.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return page.getByRole(target.role, { name: new RegExp(`^(?:${alternatives.join('|')})$`) });
  }
  if (target.by === 'rolePattern') {
    const matches = page.getByRole(target.role, { name: new RegExp(target.pattern, 'i') });
    return target.role === 'button' ? matches.and(page.locator('button:not([disabled])')).last() : matches.last();
  }
  return page.getByRole(target.role, { name: target.value, exact: true });
}

function targetLabel(target: Target): string {
  if (target.by === 'roleAny') return target.values.join(' | ');
  return target.by === 'rolePattern' || target.by === 'textPattern' ? target.pattern : target.value;
}

function capturedCursorScript(primary: string): string {
  return `(() => {
    const mount = () => {
      if (document.querySelector('[data-product-demo-cursor]') || !document.documentElement) return;
      const color = ${JSON.stringify(primary)};
      const cursor = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      cursor.setAttribute('data-product-demo-cursor', '');
      cursor.setAttribute('viewBox', '0 0 28 36');
      cursor.setAttribute('aria-hidden', 'true');
      Object.assign(cursor.style, {
        position: 'fixed', left: '0', top: '0', width: '28px', height: '36px', overflow: 'visible',
        borderRadius: '0', filter: 'drop-shadow(0 3px 3px rgba(0,0,0,.35))',
        transform: 'translate3d(40px,40px,0)', transformOrigin: '0 0', pointerEvents: 'none', zIndex: '2147483647'
      });
      const pathData = 'M3 2 L3 29 L10 22 L15 33 L21 30 L16 20 L26 20 Z';
      const accent = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      accent.setAttribute('d', pathData);
      accent.setAttribute('fill', '#fff');
      accent.setAttribute('stroke', color);
      accent.setAttribute('stroke-width', '5');
      accent.setAttribute('stroke-linejoin', 'round');
      const outline = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      outline.setAttribute('d', pathData);
      outline.setAttribute('fill', '#fff');
      outline.setAttribute('stroke', '#071b19');
      outline.setAttribute('stroke-width', '2');
      outline.setAttribute('stroke-linejoin', 'round');
      cursor.append(accent, outline);
      document.documentElement.append(cursor);
      document.addEventListener('pointermove', (event) => {
        cursor.style.transform = 'translate3d(' + event.clientX + 'px,' + event.clientY + 'px,0)';
      }, { passive: true });
    };
    mount();
    if (!document.documentElement) document.addEventListener('DOMContentLoaded', mount, { once: true });
  })()`;
}

export async function installCapturedCursor(page: Page, primary: string): Promise<void> {
  const script = capturedCursorScript(primary);
  await page.addInitScript(script);
  await page.evaluate(script);
}

export function textRedactionScript(pairs: Array<{ source: string; replacement: string }>): string {
  return `(() => {
    const pairs = ${JSON.stringify(pairs)};
    const redactValue = (input) => {
      let value = input;
      for (const pair of pairs) value = value.split(pair.source).join(pair.replacement);
      return value;
    };
    const redactNode = (root) => {
      const redactText = (node) => {
        const value = redactValue(node.data);
        if (value !== node.data) node.data = value;
      };
      const redactControl = (node) => {
        if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)) return;
        const value = redactValue(node.value);
        if (value !== node.value) node.value = value;
        if (node.hasAttribute('value')) {
          const attribute = node.getAttribute('value') ?? '';
          const redacted = redactValue(attribute);
          if (redacted !== attribute) node.setAttribute('value', redacted);
        }
      };
      if (root.nodeType === Node.TEXT_NODE) redactText(root);
      if (root.nodeType === Node.ELEMENT_NODE) redactControl(root);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      let node = walker.nextNode();
      while (node) {
        if (node.nodeType === Node.TEXT_NODE) redactText(node);
        else redactControl(node);
        node = walker.nextNode();
      }
    };
    const start = () => {
      redactNode(document);
      new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'characterData') redactNode(mutation.target);
          if (mutation.type === 'attributes') redactNode(mutation.target);
          for (const node of mutation.addedNodes) redactNode(node);
        }
      }).observe(document, { attributes: true, childList: true, characterData: true, subtree: true });
    };
    if (document.documentElement) start();
    else document.addEventListener('DOMContentLoaded', start, { once: true });
  })()`;
}

export async function installTextRedactions(
  page: Page,
  redactions: DemoConfig['privacy']['redactions'],
  environment: Record<string, string | undefined> = process.env
): Promise<void> {
  if (redactions.length === 0) return;
  const pairs = redactions.map(({ sourceEnv, replacement }) => {
    const source = environment[sourceEnv];
    if (!source) throw new Error(`Missing capture redaction environment variable ${sourceEnv}`);
    return { source, replacement };
  });
  const script = textRedactionScript(pairs);
  await page.addInitScript(script);
  await page.evaluate(script);
}

async function ensureCapturedCursor(page: Page, primary: string): Promise<void> {
  await page.evaluate(capturedCursorScript(primary));
}

export async function executeAction(page: Page, action: Action, human = false, cursor: Point = { x: 40, y: 40 }, screenshotPath?: string): Promise<{ box?: { x: number; y: number; width: number; height: number } | null; cursor: Point }> {
  if (action.type === 'goto') {
    await page.goto(action.path, { waitUntil: 'networkidle' });
    return { cursor };
  }
  if (action.type === 'screenshot') {
    if (!screenshotPath) throw new Error(`Screenshot path missing for ${action.name}`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return { cursor };
  }
  const locator = action.target ? locatorFor(page, action.target) : undefined;
  if (locator) {
    try {
      await locator.waitFor({ state: action.type === 'assert' && action.state === 'hidden' ? 'attached' : 'visible', timeout: action.timeoutMs ?? 90_000 });
    } catch (error) {
      if (action.optional) return { cursor };
      throw error;
    }
  }
  const box = locator ? await locator.boundingBox() : undefined;
  if (human && box && ['click', 'fill', 'select'].includes(action.type)) {
    const target = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const distance = Math.hypot(target.x - cursor.x, target.y - cursor.y);
    const durationMs = action.timing?.cursorDurationMs ?? Math.round(Math.max(280, Math.min(700, 260 + distance * 0.45)));
    for (const entry of cursorMotion(cursor, target, durationMs).slice(1)) {
      await page.mouse.move(entry.point.x, entry.point.y);
      await page.waitForTimeout(entry.waitAfterMs);
    }
    cursor = target;
    await page.waitForTimeout(action.timing?.settleBeforeMs ?? 140);
  }
  if (action.type === 'click') await locator!.click();
  if (action.type === 'fill') {
    if (human) { await locator!.fill(''); await locator!.pressSequentially(action.text, { delay: action.timing?.keystrokeDelayMs ?? 55 }); }
    else await locator!.fill(action.text);
  }
  if (action.type === 'select') await locator!.selectOption(action.value);
  if (action.type === 'scroll') {
    if (locator) await locator.scrollIntoViewIfNeeded();
    else if (human) {
      for (const entry of scrollMotion(action.deltaY ?? 500)) {
        await page.mouse.wheel(0, entry.deltaY);
        await page.waitForTimeout(entry.waitAfterMs);
      }
    } else await page.mouse.wheel(0, action.deltaY ?? 500);
  }
  if (action.type === 'assert') {
    if (action.state === 'visible' && !await locator!.isVisible()) throw new Error(`Expected ${targetLabel(action.target)} to be visible`);
    if (action.state === 'hidden' && await locator!.isVisible()) throw new Error(`Expected ${targetLabel(action.target)} to be hidden`);
    if (action.state === 'checked' && !await locator!.isChecked()) throw new Error(`Expected ${targetLabel(action.target)} to be checked`);
    if (action.text && !((await locator!.textContent()) ?? '').includes(action.text)) throw new Error(`Expected ${targetLabel(action.target)} to contain ${action.text}`);
  }
  return { box, cursor };
}

export function browserContextOptions(config: DemoConfig, deviceName: string, actor: Scenario['actors'][number], locale: string) {
  const profile = config.devices[deviceName];
  if (!profile) throw new Error(`Unknown device profile ${deviceName}`);
  const descriptor = profile.device ? devices[profile.device] : undefined;
  return { ...descriptor, viewport: { width: profile.width, height: profile.height }, locale, colorScheme: 'light' as const, storageState: actor.storageState };
}

export function sceneActionPhases(mode: ExecuteOptions['mode'], actions: Action[]): { preload: Action[]; capture: Action[]; captureOffset: number } {
  if (mode === 'record' && actions[0]?.type === 'goto') {
    return { preload: [actions[0]], capture: actions.slice(1), captureOffset: 1 };
  }
  return { preload: [], capture: actions, captureOffset: 0 };
}

async function runPass(options: ExecuteOptions, pass: number) {
  if (options.scenario.preconditions.resetCommand) await execAsync(options.scenario.preconditions.resetCommand, { cwd: options.config.repository.root });
  if (options.scenario.preconditions.seedCommand) await execAsync(options.scenario.preconditions.seedCommand, { cwd: options.config.repository.root });
  const browser = await chromium.launch({ headless: options.config.runtime.headless });
  const contexts = new Map<string, BrowserContext>();
  const pages = new Map<string, Page>();
  const consoleErrors: string[] = [];
  const failedRequests: Array<{ url: string; status?: number; error?: string }> = [];
  const events: TimelineEvent[] = [];
  const sceneReports: Array<{ id: string; status: 'passed' | 'failed' | 'omitted'; failure?: string }> = [];
  const rawArtifacts: Record<string, string> = {};
  const traceArtifacts: Record<string, string> = {};
  const passStart = performance.now();
  const cursors = new Map<string, Point>();
  try {
    for (const actor of options.scenario.actors) {
      const context = await browser.newContext(browserContextOptions(options.config, options.device, actor, options.scenario.locale));
      if (options.mode === 'record') await context.tracing.start({ screenshots: false, snapshots: true, sources: true });
      const page = await context.newPage();
      await installTextRedactions(page, options.config.privacy.redactions);
      if (options.mode === 'record') await installCapturedCursor(page, options.scenario.branding.primary);
      page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
      page.on('requestfailed', (request) => {
        const error = request.failure()?.errorText;
        if (!isIgnorableRequestFailure(error)) failedRequests.push({ url: request.url(), error });
      });
      page.on('response', (response) => { if (response.status() >= 400) failedRequests.push({ url: response.url(), status: response.status() }); });
      contexts.set(actor.id, context);
      pages.set(actor.id, page);
    }
    for (const scene of options.scenario.scenes) {
      const page = pages.get(scene.actor);
      if (!page) throw new Error(`Actor ${scene.actor} has no browser context`);
      let failed: string | undefined;
      let recordingStarted = false;
      const rawPath = join(options.outputDirectory, `raw-${scene.id}.webm`);
      const phases = sceneActionPhases(options.mode, scene.actions);
      for (const [actionIndex, sourceAction] of phases.preload.entries()) {
        const action = sourceAction.type === 'goto' ? { ...sourceAction, path: new URL(sourceAction.path, options.config.app.url).toString() } : sourceAction;
        const startedAtMs = performance.now() - passStart;
        try {
          const { box, cursor } = await executeAction(page, action, false, cursors.get(scene.actor));
          if (sourceAction.type === 'goto') await ensureCapturedCursor(page, options.scenario.branding.primary);
          cursors.set(scene.actor, cursor);
          events.push({ sceneId: scene.id, actionIndex, type: sourceAction.type, label: sourceAction.title ?? sourceAction.type, actor: scene.actor, startedAtMs, endedAtMs: performance.now() - passStart, target: 'target' in sourceAction ? sourceAction.target : undefined, box, state: 'passed' });
        } catch (error) {
          failed = `${error instanceof Error ? error.message : String(error)}\nURL: ${page.url()}`;
          events.push({ sceneId: scene.id, actionIndex, type: sourceAction.type, label: sourceAction.title ?? sourceAction.type, actor: scene.actor, startedAtMs, endedAtMs: performance.now() - passStart, target: 'target' in sourceAction ? sourceAction.target : undefined, state: 'failed' });
          break;
        }
      }
      if (options.mode === 'record' && !failed) {
        await page.screencast.start({ path: rawPath, size: { width: options.config.devices[options.device].width, height: options.config.devices[options.device].height }, quality: 90 });
        recordingStarted = true;
      }
      for (const [phaseIndex, sourceAction] of phases.capture.entries()) {
        if (failed) break;
        const actionIndex = phaseIndex + phases.captureOffset;
        const action = sourceAction.type === 'goto' ? { ...sourceAction, path: new URL(sourceAction.path, options.config.app.url).toString() } : sourceAction;
        const startedAtMs = performance.now() - passStart;
        try {
          const screenshotName = sourceAction.type === 'screenshot' ? sourceAction.name : undefined;
          const screenshotPath = screenshotName ? join(options.outputDirectory, `${scene.id}-${screenshotName}.png`) : undefined;
          const { box, cursor } = await executeAction(page, action, options.mode === 'record', cursors.get(scene.actor), screenshotPath);
          if (options.mode === 'record' && sourceAction.type === 'goto') await ensureCapturedCursor(page, options.scenario.branding.primary);
          cursors.set(scene.actor, cursor);
          if (screenshotPath && screenshotName) rawArtifacts[`evidence-${scene.id}-${screenshotName}`] = screenshotPath;
          if (options.mode === 'record') await page.waitForTimeout(sourceAction.timing?.pauseAfterMs ?? actionDelay(sourceAction.type, sourceAction.type === 'fill' ? sourceAction.text : ''));
          events.push({ sceneId: scene.id, actionIndex, type: sourceAction.type, label: sourceAction.title ?? sourceAction.type, actor: scene.actor, startedAtMs, endedAtMs: performance.now() - passStart, target: 'target' in sourceAction ? sourceAction.target : undefined, box, state: 'passed' });
        } catch (error) {
          failed = `${error instanceof Error ? error.message : String(error)}\nURL: ${page.url()}`;
          events.push({ sceneId: scene.id, actionIndex, type: sourceAction.type, label: sourceAction.title ?? sourceAction.type, actor: scene.actor, startedAtMs, endedAtMs: performance.now() - passStart, target: 'target' in sourceAction ? sourceAction.target : undefined, state: 'failed' });
          break;
        }
      }
      if (recordingStarted) {
        await page.screencast.stop();
        rawArtifacts[`raw-${scene.id}`] = rawPath;
        const screenshotPath = join(options.outputDirectory, `final-${scene.id}.png`);
        await page.screenshot({ path: screenshotPath });
        rawArtifacts[`screenshot-${scene.id}`] = screenshotPath;
      }
      sceneReports.push(failed ? { id: scene.id, status: 'failed', failure: failed } : { id: scene.id, status: 'passed' });
      if (failed) {
        for (const omitted of options.scenario.scenes.slice(sceneReports.length)) sceneReports.push({ id: omitted.id, status: 'omitted', failure: `Previous scene failed: ${scene.id}` });
        break;
      }
    }
  } finally {
    if (options.mode === 'record') {
      for (const [actor, context] of contexts) {
        const tracePath = join(options.outputDirectory, `trace-${actor}.zip`);
        await context.tracing.stop({ path: tracePath });
        traceArtifacts[`trace-${actor}`] = tracePath;
      }
    }
    await Promise.all([...contexts.values()].map((context) => context.close()));
    await browser.close();
  }
  return { pass, passed: sceneReports.length === options.scenario.scenes.length && sceneReports.every((scene) => scene.status === 'passed') && consoleErrors.length === 0 && failedRequests.length === 0, sceneReports, consoleErrors, failedRequests, events, artifacts: { ...rawArtifacts, ...traceArtifacts } };
}

export async function executeScenario(options: ExecuteOptions): Promise<unknown> {
  assertSafeTarget(options.config.app.url, options.config.privacy.allowProduction);
  await mkdir(options.outputDirectory, { recursive: true });
  const startedAt = new Date().toISOString();
  const digest = await scenarioDigest(options.scenario);
  if (options.mode === 'record') {
    if (!options.rehearsalReceiptPath) throw new Error('Recording requires a rehearsal receipt');
    const receipt = JSON.parse(await readFile(options.rehearsalReceiptPath, 'utf8')) as unknown;
    if (!canRecord(digest, receipt)) throw new Error('Recording requires two successful rehearsals for the exact scenario digest');
  }
  let consecutivePasses = 0;
  let result = await runPass(options, 1);
  consecutivePasses = result.passed ? 1 : 0;
  if (options.mode === 'rehearse' && result.passed) {
    result = await runPass(options, 2);
    consecutivePasses = result.passed ? 2 : 0;
  }
  const profile = options.config.devices[options.device];
  const timelinePath = join(options.outputDirectory, 'timeline.json');
  const reportPath = join(options.outputDirectory, 'execution-report.json');
  await writeFile(timelinePath, JSON.stringify(TimelineSchema.parse({ version: 2, scenarioId: options.scenario.id, viewport: { width: profile.width, height: profile.height }, events: result.events }), null, 2));
  const report = ExecutionReportSchema.parse({ version: 2, scenarioId: options.scenario.id, mode: options.mode, passed: result.passed && (options.mode === 'record' || consecutivePasses >= options.config.runtime.rehearsalPasses), consecutivePasses, startedAt, endedAt: new Date().toISOString(), scenarioDigest: digest, scenes: result.sceneReports, consoleErrors: result.consoleErrors, failedRequests: result.failedRequests, artifacts: { timeline: timelinePath, report: reportPath, ...result.artifacts } });
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  return report;
}
