import { createHash } from 'node:crypto';

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)]));
  return value;
}

export async function scenarioDigest(scenario: unknown): Promise<string> {
  return createHash('sha256').update(JSON.stringify(stable(scenario))).digest('hex');
}

export function canRecord(digest: string, receipt: unknown, requiredPasses = 2): boolean {
  if (!receipt || typeof receipt !== 'object') return false;
  const candidate = receipt as { scenarioDigest?: string; consecutivePasses?: number; passed?: boolean };
  return candidate.passed === true && candidate.scenarioDigest === digest && (candidate.consecutivePasses ?? 0) >= requiredPasses;
}
