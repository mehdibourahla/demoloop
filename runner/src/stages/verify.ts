import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { browserContextOptions, executeAction } from '../../../src/runner.js';
import { ConfigSchema, ScenarioSchema } from '../../../src/schemas.js';
import { verifyTargets } from '../../../src/verify.js';

const execAsync = promisify(exec);

export interface VerifyPayload {
  scenario: unknown;
  config: unknown;
  device?: string;
}

export async function verify(payload: VerifyPayload): Promise<Record<string, unknown>> {
  const scenario = ScenarioSchema.parse(payload.scenario);
  const config = ConfigSchema.parse(payload.config);
  const device = payload.device ?? 'desktop';
  const timeoutMs = Math.min(config.runtime.actionTimeoutMs, 5_000);

  const browser = await chromium.launch({ headless: config.runtime.headless });
  try {
    const actor = scenario.actors[0];
    const context = await browser.newContext(browserContextOptions(config, device, actor, scenario.locale));
    const page = await context.newPage();
    if (scenario.preconditions.resetCommand) await execAsync(scenario.preconditions.resetCommand, { cwd: config.repository.root });
    if (scenario.preconditions.seedCommand) await execAsync(scenario.preconditions.seedCommand, { cwd: config.repository.root });
    await page.goto(config.app.url, { waitUntil: 'load' });

    const findings = await verifyTargets(page, scenario, timeoutMs, async (action) => {
      const resolved = action.type === 'goto' ? { ...action, path: new URL(action.path, config.app.url).toString() } : action;
      await executeAction(page, resolved, false, undefined, undefined, timeoutMs);
    });
    const drifted = findings.filter((finding) => finding.status !== 'resolved');

    return {
      passed: drifted.length === 0,
      scenarioDigest: scenario.id,
      resolved: findings.length - drifted.length,
      checked: findings.length,
      drifted
    };
  } finally {
    await browser.close();
  }
}
