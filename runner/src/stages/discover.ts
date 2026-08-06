import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverProduct } from '../../../src/discovery.js';
import { ConfigSchema, ProductModelSchema } from '../../../src/schemas.js';

export interface DiscoverPayload {
  config: unknown;
}

export async function discover(payload: DiscoverPayload): Promise<Record<string, unknown>> {
  const config = ConfigSchema.parse(payload.config);
  const outputDirectory = await mkdtemp(join(tmpdir(), 'demoloop-discover-'));
  const model = await discoverProduct(config.repository.root, config.app.url, outputDirectory);

  const artifacts: Record<string, string> = {};
  for (const surface of model.proofSurfaces) {
    for (const entry of surface.evidence) {
      if (entry.type !== 'runtime') continue;
      for (const field of ['screenshot', 'ariaSnapshot'] as const) {
        const path = entry[field];
        if (!path) continue;
        const name = `evidence-${surface.id}${field === 'screenshot' ? '.png' : '.aria.yml'}`;
        artifacts[name] = path;
        entry[field] = name;
      }
    }
  }

  return { passed: true, model: ProductModelSchema.parse(model), artifacts };
}
