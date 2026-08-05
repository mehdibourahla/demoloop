import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { discoverProduct } from '../../src/discovery.js';
import { plan } from '../src/stages/plan.js';

test('turns a product model into scenarios with coverage', async () => {
  const model = await discoverProduct(resolve('fixtures/neutral/handoff'));

  const result = await plan({ model, mode: 'journey', journeyId: 'deliver-item', locale: 'en' });

  expect(result.passed).toBe(true);
  const planned = result.plan as { status: string; outputs: Array<{ id: string }> };
  expect(planned.status).toBe('planned');
  expect(planned.outputs.length).toBeGreaterThan(0);
});

test('reports needs-authoring instead of inventing a scenario', async () => {
  const model = await discoverProduct(resolve('fixtures/neutral/route-only'));

  const result = await plan({ model, mode: 'full', locale: 'en' });

  expect(result.passed).toBe(false);
  expect((result.plan as { status: string }).status).toBe('needs-authoring');
});
