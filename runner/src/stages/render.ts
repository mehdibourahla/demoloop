import { access, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderDemo } from '../../../src/render.js';
import { ConfigSchema, ScenarioSchema } from '../../../src/schemas.js';

export interface StageContext {
  download(keys: Record<string, string>): Promise<Record<string, string>>;
}

export interface RenderPayload {
  scenario: unknown;
  config: unknown;
  device?: string;
  artifacts: Record<string, string>;
}

export async function render(payload: RenderPayload, context: StageContext): Promise<Record<string, unknown>> {
  const scenario = ScenarioSchema.parse(payload.scenario);
  const config = ConfigSchema.parse(payload.config);
  const device = payload.device ?? 'desktop';
  const artifacts = await context.download(payload.artifacts);
  const outputDirectory = await mkdtemp(join(tmpdir(), 'demoloop-render-'));

  const video = await renderDemo({
    scenario, config, executionReport: { artifacts }, outputDirectory, device
  });

  const extras: Record<string, string> = {};
  for (const [name, file] of [['presentation-metadata', 'presentation-metadata.json'], ['edl', 'edl.json'], ['subtitles', 'subtitles.srt']]) {
    const path = join(outputDirectory, file);
    try { await access(path); extras[name] = path; } catch { /* not every policy produces one */ }
  }
  return { passed: true, artifacts: { video, ...extras } };
}
