import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateDemo } from '../../../src/evaluate.js';
import { ConfigSchema, ExecutionReportSchema, QualityReportSchema, ScenarioSchema } from '../../../src/schemas.js';
import type { RenderPayload, StageContext } from './render.js';

export async function evaluate(payload: RenderPayload, context: StageContext): Promise<Record<string, unknown>> {
  const scenario = ScenarioSchema.parse(payload.scenario);
  const config = ConfigSchema.parse(payload.config);
  const device = payload.device ?? 'desktop';
  const artifacts = await context.download(payload.artifacts);
  const captured = ExecutionReportSchema.parse(JSON.parse(await readFile(artifacts.report, 'utf8')));
  const outputDirectory = await mkdtemp(join(tmpdir(), 'demoloop-evaluate-'));
  const outputPath = join(outputDirectory, 'quality-report.json');

  const quality = QualityReportSchema.parse(await evaluateDemo({
    scenario, config,
    executionReport: { ...captured, artifacts },
    videoPath: artifacts.video,
    timelinePath: artifacts.timeline,
    presentationMetadataPath: artifacts['presentation-metadata'],
    outputPath, device
  }));

  return { passed: quality.technical.passed, status: quality.status, quality, artifacts: { 'quality-report': outputPath } };
}
