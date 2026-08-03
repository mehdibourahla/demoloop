import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { discoverProduct } from '../src/discovery.js';
import { planDemo } from '../src/planner.js';

const fixtureRoot = resolve('fixtures/neutral');

describe('neutral canonical fixtures', () => {
  test.each([
    ['stateful', 'stateful'],
    ['handoff', 'stateful'],
    ['analytics', 'read-only'],
    ['operations', 'operational'],
    ['mobile', 'stateful']
  ])('%s produces a capability-aware plan', async (name, shape) => {
    const model = await discoverProduct(resolve(fixtureRoot, name));
    const result = planDemo(model, { mode: 'full' });

    expect(model.capabilities.some((capability) => capability.shape === shape)).toBe(true);
    expect(result.status).toBe('planned');
    if (result.status === 'planned') expect(result.outputs.some((output) => output.outputType === 'public-master')).toBe(true);
  });

  test('route-rich fixture remains a needs-authoring result', async () => {
    const model = await discoverProduct(resolve(fixtureRoot, 'route-only'));
    const result = planDemo(model, { mode: 'full' });

    expect(model.proofSurfaces.length).toBeGreaterThan(1);
    expect(result.status).toBe('needs-authoring');
  });
});
