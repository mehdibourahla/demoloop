import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeScenario } from '../../../src/runner.js';
import { ConfigSchema, ExecutionReportSchema, ScenarioSchema } from '../../../src/schemas.js';

export interface CapturePayload {
  scenario: unknown;
  config: unknown;
  device?: string;
  narrationSeconds?: Record<string, number>;
}

export async function capture(payload: CapturePayload): Promise<Record<string, unknown>> {
  const scenario = ScenarioSchema.parse(payload.scenario);
  const config = ConfigSchema.parse(payload.config);
  const device = payload.device ?? 'desktop';
  const narrationSeconds = payload.narrationSeconds;
  const workspace = await mkdtemp(join(tmpdir(), 'demoloop-capture-'));

  const rehearsal = ExecutionReportSchema.parse(await executeScenario({
    scenario, config, mode: 'rehearse', outputDirectory: join(workspace, 'rehearsal'), device, narrationSeconds
  }));
  if (!rehearsal.passed) return rehearsal;

  return ExecutionReportSchema.parse(await executeScenario({
    scenario, config, mode: 'record', outputDirectory: join(workspace, 'recording'), device,
    rehearsalReceiptPath: rehearsal.artifacts.report, narrationSeconds
  }));
}
