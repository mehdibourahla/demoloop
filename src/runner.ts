import { exec } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';
import { chromium, devices, type BrowserContext, type Locator, type Page } from 'playwright';
import { actionDelay, cursorMotion, scrollMotion, type Point } from './timing.js';
import { assertSafeTarget, scanCaptureArtifacts, scanSensitiveText } from './safety.js';
import { canRecord, scenarioDigest } from './receipt.js';
import { ExecutionReportSchema, TimelineSchema, type Action, type ActionTiming, type Condition, type DemoConfig, type Scenario, type Target, type TimelineEvent } from './schemas.js';

const execAsync = promisify(exec);

export interface ExecuteOptions { scenario: Scenario; config: DemoConfig; mode: 'rehearse' | 'record'; outputDirectory: string; device: string; rehearsalReceiptPath?: string; narrationSeconds?: Record<string, number> }

export function isIgnorableRequestFailure(errorText: string | undefined): boolean {
  return errorText === 'net::ERR_ABORTED';
}

export function isIgnoredRequest(url: string, patterns: string[]): boolean {
  return patterns.some((pattern) => new RegExp(pattern).test(url));
}

export function isIgnoredConsoleError(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => new RegExp(pattern).test(text));
}

function scopeFor(page: Page, target: Target) {
  const within = 'within' in target ? target.within : undefined;
  if (!within) return page;
  let scope = within.role ? page.getByRole(within.role) : page.locator('body');
  if (within.testId) scope = (within.role ? scope : page).getByTestId(within.testId);
  return scope.last();
}

export function locatorFor(page: Page, target: Target): Locator {
  const scope = scopeFor(page, target);
  if (target.by === 'label') return scope.getByLabel(target.value, { exact: true });
  if (target.by === 'testId') return scope.getByTestId(target.value);
  if (target.by === 'text') return scope.getByText(target.value, { exact: true }).first();
  if (target.by === 'textPattern') return scope.getByText(new RegExp(target.pattern, 'i')).first();
  if (target.by === 'roleAny') {
    const alternatives = target.values.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return scope.getByRole(target.role, { name: new RegExp(`^(?:${alternatives.join('|')})$`) });
  }
  if (target.by === 'rolePattern') {
    const matches = scope.getByRole(target.role, { name: new RegExp(target.pattern, 'i') });
    return target.role === 'button' ? matches.and(page.locator('button:not([disabled])')).last() : matches.last();
  }
  return scope.getByRole(target.role, { name: target.value, exact: true });
}

function targetLabel(target: Target): string {
  if (target.by === 'roleAny') return target.values.join(' | ');
  return target.by === 'rolePattern' || target.by === 'textPattern' ? target.pattern : target.value;
}

function capturedCursorScript(primary: string): string {
  return `(() => {
    const mount = () => {
      if (document.querySelector('[data-demoloop-cursor]') || !document.documentElement) return;
      const color = ${JSON.stringify(primary)};
      const cursor = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      cursor.setAttribute('data-demoloop-cursor', '');
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

async function approach(page: Page, box: { x: number; y: number; width: number; height: number } | null | undefined, human: boolean, cursor: Point, timing?: ActionTiming): Promise<Point> {
  if (!human || !box) return cursor;
  const target = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const distance = Math.hypot(target.x - cursor.x, target.y - cursor.y);
  const durationMs = timing?.cursorDurationMs ?? Math.round(Math.max(280, Math.min(700, 260 + distance * 0.45)));
  for (const entry of cursorMotion(cursor, target, durationMs).slice(1)) {
    await page.mouse.move(entry.point.x, entry.point.y);
    await page.waitForTimeout(entry.waitAfterMs);
  }
  await page.waitForTimeout(timing?.settleBeforeMs ?? 140);
  return target;
}

export function candidateLocator(page: Page, target: Target): Locator {
  const scope = scopeFor(page, target);
  if (target.by === 'label') return scope.getByLabel(target.value, { exact: true });
  if (target.by === 'testId') return scope.getByTestId(target.value);
  if (target.by === 'text') return scope.getByText(target.value, { exact: true });
  if (target.by === 'textPattern') return scope.getByText(new RegExp(target.pattern, 'i'));
  if (target.by === 'roleAny') {
    const alternatives = target.values.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return scope.getByRole(target.role, { name: new RegExp(`^(?:${alternatives.join('|')})$`) });
  }
  if (target.by === 'rolePattern') return scope.getByRole(target.role, { name: new RegExp(target.pattern, 'i') });
  return scope.getByRole(target.role, { name: target.value, exact: true });
}

export function targetDescription(target: Target): string {
  return targetLabel(target);
}

export function selectByIntent(options: string[], prefer: string[], avoid: string[]): number | undefined {
  const permitted = options.map((text, index) => ({ text, index })).filter((option) => !avoid.some((pattern) => new RegExp(pattern, 'i').test(option.text)));
  for (const wanted of prefer) {
    const match = permitted.find((option) => new RegExp(wanted, 'i').test(option.text));
    if (match) return match.index;
  }
  return permitted[0]?.index;
}

async function conditionHolds(page: Page, condition: Condition): Promise<boolean> {
  const visible = await locatorFor(page, condition.target).isVisible();
  return condition.state === 'visible' ? visible : !visible;
}

export async function executeAction(page: Page, action: Action, human = false, cursor: Point = { x: 40, y: 40 }, screenshotPath?: string, defaultTimeoutMs = 10_000): Promise<{ box?: { x: number; y: number; width: number; height: number } | null; cursor: Point; label?: string; details?: string[] }> {
  if (action.type === 'repeat') {
    const details: string[] = [];
    let iterations = 0;
    while (iterations < action.maxIterations && !await conditionHolds(page, action.until)) {
      for (const child of action.actions) {
        const result = await executeAction(page, child, human, cursor, undefined, defaultTimeoutMs);
        cursor = result.cursor;
        details.push(...(result.details ?? []));
      }
      iterations += 1;
    }
    if (!await conditionHolds(page, action.until)) throw new Error(`Repeat stopped after ${iterations} iterations without ${targetLabel(action.until.target)} becoming ${action.until.state}`);
    return { cursor, label: `repeat x${iterations}`, details: [`repeat x${iterations}`, ...details] };
  }
  if (action.type === 'branch') {
    const taken = await conditionHolds(page, action.when);
    const details = [`branch taken: ${taken ? 'then' : 'otherwise'}`];
    for (const child of taken ? action.then : action.otherwise) {
      const result = await executeAction(page, child, human, cursor, undefined, defaultTimeoutMs);
      cursor = result.cursor;
      details.push(...(result.details ?? []));
    }
    return { cursor, label: `branch: ${taken ? 'then' : 'otherwise'}`, details };
  }
  if (action.type === 'choose') {
    const candidates = await candidateLocator(page, action.target).all();
    const available: Array<{ index: number; text: string }> = [];
    for (const [index, candidate] of candidates.entries()) {
      if (!await candidate.isVisible() || !await candidate.isEnabled()) continue;
      available.push({ index, text: ((await candidate.textContent()) ?? '').trim() });
    }
    const chosen = selectByIntent(available.map((option) => option.text), action.prefer, action.avoid);
    if (chosen === undefined) {
      if (action.optional) return { cursor };
      throw new Error(`No permitted option for ${targetLabel(action.target)} among ${available.map((option) => option.text).join(' | ') || 'nothing visible'}`);
    }
    const picked = available[chosen];
    if (action.requirePreferred && !action.prefer.some((wanted) => new RegExp(wanted, 'i').test(picked.text))) {
      throw new Error(`No preferred option for ${targetLabel(action.target)} among ${available.map((option) => option.text).join(' | ')}`);
    }
    const locator = candidates[picked.index];
    const box = await locator.boundingBox();
    cursor = await approach(page, box, human, cursor, action.timing);
    await locator.click();
    return { box, cursor, label: `chose ${picked.text}`, details: [`chose "${picked.text}"`] };
  }
  if (action.type === 'goto') {
    await page.goto(action.path, { waitUntil: 'load' });
    return { cursor };
  }
  if (action.type === 'waitFor') {
    const locator = locatorFor(page, action.target);
    const deadline = Date.now() + (action.timeoutMs ?? defaultTimeoutMs);
    while (Date.now() < deadline) {
      const settled = action.state === 'visible' ? await locator.isVisible()
        : action.state === 'hidden' ? !(await locator.isVisible())
        : action.state === 'enabled' ? await locator.isVisible() && await locator.isEnabled()
        : !(await locator.isVisible()) || !(await locator.isEnabled());
      if (settled) return { cursor };
      await page.waitForTimeout(100);
    }
    if (action.optional) return { cursor };
    throw new Error(`Timed out waiting for ${targetLabel(action.target)} to be ${action.state}`);
  }
  if (action.type === 'screenshot') {
    if (!screenshotPath) throw new Error(`Screenshot path missing for ${action.name}`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return { cursor };
  }
  const locator = action.target ? locatorFor(page, action.target) : undefined;
  if (locator) {
    try {
      await locator.waitFor({ state: action.type === 'assert' && action.state === 'hidden' ? 'attached' : 'visible', timeout: action.timeoutMs ?? defaultTimeoutMs });
    } catch (error) {
      if (action.optional) return { cursor };
      throw error;
    }
  }
  const box = locator ? await locator.boundingBox() : undefined;
  if (['click', 'fill', 'select'].includes(action.type)) cursor = await approach(page, box, human, cursor, action.timing);
  if (action.type === 'click') await locator!.click();
  if (action.type === 'fill') {
    if (human) { await locator!.fill(''); await locator!.pressSequentially(action.text, { delay: action.timing?.keystrokeDelayMs ?? 55 }); }
    else await locator!.fill(action.text);
  }
  if (action.type === 'select') await locator!.selectOption(action.value);
  if (action.type === 'scroll') {
    if (locator) await locator.scrollIntoViewIfNeeded();
    else if (human) {
      const viewport = page.viewportSize();
      if (viewport) cursor = await approach(page, { x: 0, y: 0, width: viewport.width, height: viewport.height }, human, cursor);
      for (const entry of scrollMotion(action.deltaY ?? 500, action.timing?.cursorDurationMs)) {
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

async function assertActorSession(page: Page, actor: Scenario['actors'][number], baseUrl: string): Promise<void> {
  const preflight = actor.preflight!;
  await page.goto(new URL(preflight.path, baseUrl).toString(), { waitUntil: 'load' });
  try {
    await locatorFor(page, preflight.target).waitFor({ state: preflight.state, timeout: preflight.timeoutMs });
  } catch {
    throw new Error(`Actor ${actor.id} session is not usable: ${targetLabel(preflight.target)} was not ${preflight.state} at ${page.url()}. Refresh the stored session for this actor.`);
  }
}

async function runPass(options: ExecuteOptions, pass: number) {
  if (options.scenario.preconditions.resetCommand) await execAsync(options.scenario.preconditions.resetCommand, { cwd: options.config.repository.root });
  if (options.scenario.preconditions.seedCommand) await execAsync(options.scenario.preconditions.seedCommand, { cwd: options.config.repository.root });
  const browser = await chromium.launch({ headless: options.config.runtime.headless });
  const contexts = new Map<string, BrowserContext>();
  const pages = new Map<string, Page>();
  const consoleErrors: string[] = [];
  const failedRequests: Array<{ url: string; status?: number; error?: string }> = [];
  const ignoredRequests: Array<{ url: string; status?: number; error?: string }> = [];
  const ignorePatterns = options.config.runtime.ignoreRequestPatterns;
  const consolePatterns = options.config.runtime.ignoreConsolePatterns;
  const ignoredConsoleErrors: string[] = [];
  const events: TimelineEvent[] = [];
  const sceneReports: Array<{ id: string; status: 'passed' | 'failed' | 'omitted'; failure?: string }> = [];
  const executedPath: Array<{ sceneId: string; actionIndex: number; detail: string }> = [];
  const rawArtifacts: Record<string, string> = {};
  const passStart = performance.now();
  const cursors = new Map<string, Point>();
  try {
    for (const actor of options.scenario.actors) {
      const context = await browser.newContext(browserContextOptions(options.config, options.device, actor, options.scenario.locale));
      const page = await context.newPage();
      await installTextRedactions(page, options.config.privacy.redactions);
      if (options.mode === 'record') await installCapturedCursor(page, options.scenario.branding.primary);
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        (isIgnoredConsoleError(message.text(), consolePatterns) ? ignoredConsoleErrors : consoleErrors).push(message.text());
      });
      page.on('requestfailed', (request) => {
        const error = request.failure()?.errorText;
        if (isIgnorableRequestFailure(error)) return;
        const failure = { url: request.url(), error };
        (isIgnoredRequest(request.url(), ignorePatterns) ? ignoredRequests : failedRequests).push(failure);
      });
      page.on('response', (response) => {
        if (response.status() < 400) return;
        const failure = { url: response.url(), status: response.status() };
        (isIgnoredRequest(response.url(), ignorePatterns) ? ignoredRequests : failedRequests).push(failure);
      });
      if (actor.preflight) await assertActorSession(page, actor, options.config.app.url);
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
          const { box, cursor } = await executeAction(page, action, false, cursors.get(scene.actor), undefined, options.config.runtime.actionTimeoutMs);
          if (sourceAction.type === 'goto') await ensureCapturedCursor(page, options.scenario.branding.primary);
          cursors.set(scene.actor, cursor);
          events.push({ sceneId: scene.id, actionIndex, type: sourceAction.type, label: sourceAction.title ?? sourceAction.type, actor: scene.actor, startedAtMs, endedAtMs: performance.now() - passStart, target: 'target' in sourceAction ? sourceAction.target : undefined, box, state: 'passed' });
        } catch (error) {
          failed = `${error instanceof Error ? error.message : String(error)}\nURL: ${page.url()}`;
          events.push({ sceneId: scene.id, actionIndex, type: sourceAction.type, label: sourceAction.title ?? sourceAction.type, actor: scene.actor, startedAtMs, endedAtMs: performance.now() - passStart, target: 'target' in sourceAction ? sourceAction.target : undefined, state: 'failed' });
          break;
        }
      }
      let captureStartedAt = 0;
      if (options.mode === 'record' && !failed) {
        await page.screencast.start({ path: rawPath, size: { width: options.config.devices[options.device].width, height: options.config.devices[options.device].height }, quality: 90 });
        recordingStarted = true;
        captureStartedAt = performance.now();
      }
      for (const [phaseIndex, sourceAction] of phases.capture.entries()) {
        if (failed) break;
        const actionIndex = phaseIndex + phases.captureOffset;
        const action = sourceAction.type === 'goto' ? { ...sourceAction, path: new URL(sourceAction.path, options.config.app.url).toString() } : sourceAction;
        const startedAtMs = performance.now() - passStart;
        try {
          const screenshotName = sourceAction.type === 'screenshot' ? sourceAction.name : undefined;
          const screenshotPath = screenshotName ? join(options.outputDirectory, `${scene.id}-${screenshotName}.png`) : undefined;
          const { box, cursor, label, details } = await executeAction(page, action, options.mode === 'record', cursors.get(scene.actor), screenshotPath, options.config.runtime.actionTimeoutMs);
          for (const detail of details ?? []) executedPath.push({ sceneId: scene.id, actionIndex, detail });
          if (options.mode === 'record' && sourceAction.type === 'goto') await ensureCapturedCursor(page, options.scenario.branding.primary);
          cursors.set(scene.actor, cursor);
          if (screenshotPath && screenshotName) rawArtifacts[`evidence-${scene.id}-${screenshotName}`] = screenshotPath;
          if (options.mode === 'record') await page.waitForTimeout(sourceAction.timing?.pauseAfterMs ?? actionDelay(sourceAction.type, sourceAction.type === 'fill' ? sourceAction.text : ''));
          events.push({ sceneId: scene.id, actionIndex, type: sourceAction.type, label: label ?? sourceAction.title ?? sourceAction.type, actor: scene.actor, startedAtMs, endedAtMs: performance.now() - passStart, target: 'target' in sourceAction ? sourceAction.target : undefined, box, state: 'passed' });
        } catch (error) {
          failed = `${error instanceof Error ? error.message : String(error)}\nURL: ${page.url()}`;
          events.push({ sceneId: scene.id, actionIndex, type: sourceAction.type, label: sourceAction.title ?? sourceAction.type, actor: scene.actor, startedAtMs, endedAtMs: performance.now() - passStart, target: 'target' in sourceAction ? sourceAction.target : undefined, state: 'failed' });
          break;
        }
      }
      if (recordingStarted) {
        const narrationMs = (options.narrationSeconds?.[scene.id] ?? 0) * 1_000;
        const shortfall = narrationMs - (performance.now() - captureStartedAt);
        if (shortfall > 0) {
          const startedAtMs = performance.now() - passStart;
          await page.waitForTimeout(shortfall);
          events.push({ sceneId: scene.id, actionIndex: scene.actions.length, type: 'narration', label: `narration pacing ${(narrationMs / 1_000).toFixed(2)}s`, actor: scene.actor, startedAtMs, endedAtMs: performance.now() - passStart, state: 'passed' });
        }
        await page.screencast.stop();
        rawArtifacts[`raw-${scene.id}`] = rawPath;
        const screenshotPath = join(options.outputDirectory, `final-${scene.id}.png`);
        await page.screenshot({ path: screenshotPath });
        rawArtifacts[`screenshot-${scene.id}`] = screenshotPath;
        const textPath = join(options.outputDirectory, `text-${scene.id}.txt`);
        await writeFile(textPath, await page.locator('body').innerText());
        rawArtifacts[`text-${scene.id}`] = textPath;
      }
      sceneReports.push(failed ? { id: scene.id, status: 'failed', failure: failed } : { id: scene.id, status: 'passed' });
      if (failed) {
        for (const omitted of options.scenario.scenes.slice(sceneReports.length)) sceneReports.push({ id: omitted.id, status: 'omitted', failure: `Previous scene failed: ${scene.id}` });
        break;
      }
    }
  } finally {
    await Promise.all([...contexts.values()].map((context) => context.close()));
    await browser.close();
  }
  return { pass, passed: sceneReports.length === options.scenario.scenes.length && sceneReports.every((scene) => scene.status === 'passed') && consoleErrors.length === 0 && failedRequests.length === 0, sceneReports, consoleErrors, ignoredConsoleErrors, failedRequests, ignoredRequests, executedPath, events, artifacts: rawArtifacts };
}

export async function executeScenario(options: ExecuteOptions): Promise<unknown> {
  assertSafeTarget(options.config.app.url, options.config.privacy.allowProduction);
  await mkdir(options.outputDirectory, { recursive: true });
  const startedAt = new Date().toISOString();
  const digest = await scenarioDigest(options.scenario);
  if (options.mode === 'record') {
    if (!options.rehearsalReceiptPath) throw new Error('Recording requires a rehearsal receipt');
    const receipt = JSON.parse(await readFile(options.rehearsalReceiptPath, 'utf8')) as unknown;
    if (!canRecord(digest, receipt, options.config.runtime.rehearsalPasses)) throw new Error(`Recording requires ${options.config.runtime.rehearsalPasses} successful rehearsals for the exact scenario digest`);
  }
  const requiredPasses = options.mode === 'rehearse' ? options.config.runtime.rehearsalPasses : 1;
  let consecutivePasses = 0;
  let result = await runPass(options, 1);
  consecutivePasses = result.passed ? 1 : 0;
  for (let pass = 2; pass <= requiredPasses && result.passed; pass += 1) {
    result = await runPass(options, pass);
    consecutivePasses = result.passed ? consecutivePasses + 1 : 0;
  }
  const profile = options.config.devices[options.device];
  const timelinePath = join(options.outputDirectory, 'timeline.json');
  const reportPath = join(options.outputDirectory, 'execution-report.json');
  await writeFile(timelinePath, JSON.stringify(TimelineSchema.parse({ version: 2, scenarioId: options.scenario.id, viewport: { width: profile.width, height: profile.height }, events: result.events }), null, 2));
  const sensitiveFindings = [
    ...scanSensitiveText(JSON.stringify(result.events), 'timeline'),
    ...scanSensitiveText(JSON.stringify({ consoleErrors: result.consoleErrors, failedRequests: result.failedRequests, executedPath: result.executedPath }), 'execution-report'),
    ...(options.config.privacy.scanArtifacts ? await scanCaptureArtifacts(result.artifacts) : [])
  ];
  const report = ExecutionReportSchema.parse({ version: 2, scenarioId: options.scenario.id, mode: options.mode, passed: result.passed && (options.mode === 'record' || consecutivePasses >= options.config.runtime.rehearsalPasses), consecutivePasses, startedAt, endedAt: new Date().toISOString(), scenarioDigest: digest, scenes: result.sceneReports, consoleErrors: result.consoleErrors, ignoredConsoleErrors: result.ignoredConsoleErrors, sensitiveFindings, narrationSeconds: options.narrationSeconds ?? {}, executedPath: result.executedPath, failedRequests: result.failedRequests, ignoredRequests: result.ignoredRequests, artifacts: { timeline: timelinePath, report: reportPath, ...result.artifacts } });
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  return report;
}
