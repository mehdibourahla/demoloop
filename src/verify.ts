import type { Page } from 'playwright';
import { candidateLocator, targetDescription } from './runner.js';
import type { Action, Scenario, Target } from './schemas.js';

export interface TargetFinding { sceneId: string; actionIndex: number; label: string; status: 'resolved' | 'missing' | 'ambiguous'; matches: number }

function targetsOf(action: Action): Array<{ target: Target; expectsMany: boolean }> {
  if (action.type === 'repeat') return [{ target: action.until.target, expectsMany: false }, ...action.actions.flatMap(targetsOf)];
  if (action.type === 'branch') return [{ target: action.when.target, expectsMany: false }, ...action.then.flatMap(targetsOf), ...action.otherwise.flatMap(targetsOf)];
  if (!('target' in action) || !action.target) return [];
  return [{ target: action.target, expectsMany: !['click', 'fill', 'select'].includes(action.type) }];
}

export async function verifyTargets(page: Page, scenario: Scenario, timeoutMs = 5_000, advance?: (action: Action) => Promise<void>): Promise<TargetFinding[]> {
  const findings: TargetFinding[] = [];
  for (const scene of scenario.scenes) {
    for (const [actionIndex, action] of scene.actions.entries()) {
      for (const { target, expectsMany } of targetsOf(action)) {
        const locator = candidateLocator(page, target);
        await locator.first().waitFor({ state: 'attached', timeout: timeoutMs }).catch(() => undefined);
        const matches = await locator.count();
        const status = matches === 0 ? 'missing' : matches > 1 && !expectsMany ? 'ambiguous' : 'resolved';
        findings.push({ sceneId: scene.id, actionIndex, label: targetDescription(target), status, matches });
      }
      if (advance) await advance(action).catch(() => undefined);
    }
  }
  return findings;
}
