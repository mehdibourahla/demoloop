import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { discoverProduct } from '../src/discovery.js';

const source = { type: 'source', path: 'src/workspace.ts', line: 4, detail: 'Declared by the product' };

describe('generic discovery', () => {
  test('preserves arbitrary actor identifiers and evidence-backed concepts from a manifest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'product-model-'));
    await writeFile(join(root, 'app-model.json'), JSON.stringify({
      version: 2,
      product: 'Signal Desk',
      audiences: [{ id: 'reviewers', name: 'Reviewers', evidence: [source] }],
      actors: [{ id: 'review-console', name: 'Review console', evidence: [source], session: { required: true, evidence: [source] } }],
      capabilities: [{ id: 'inspect-signal', name: 'Inspect signal', shape: 'read-only', evidence: [source], states: [], outcomes: ['signal-found'], proofSurfaces: ['signal-panel'], safeActions: ['filter-signal'] }],
      outcomes: [{ id: 'signal-found', name: 'Signal found', evidence: [source] }],
      proofSurfaces: [{ id: 'signal-panel', name: 'Signal panel', route: '/signals', evidence: [source] }],
      safeActions: [{ id: 'filter-signal', type: 'select', target: { by: 'label', value: 'Window' }, value: 'week', evidence: [source] }],
      journeys: [{ id: 'find-signal', name: 'Find signal', audienceIds: ['reviewers'], capabilityIds: ['inspect-signal'], outcomeIds: ['signal-found'], steps: [{ id: 'inspect', capabilityId: 'inspect-signal', ownership: { status: 'resolved', actorId: 'review-console', evidence: [source] }, proofSurfaceId: 'signal-panel', safeActionIds: ['filter-signal'] }], evidence: [source] }]
    }));

    const model = await discoverProduct(root);

    expect(model.version).toBe(2);
    expect(model.actors.map((actor) => actor.id)).toEqual(['review-console']);
    expect(model.capabilities[0].evidence).toEqual([source]);
    expect(model.journeys[0].steps[0].ownership).toMatchObject({ status: 'resolved', actorId: 'review-console' });
  });

  test('source fallback reports route proof candidates without inventing actors or journeys', async () => {
    const root = await mkdtemp(join(tmpdir(), 'route-only-'));
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'route-catalog' }));
    await writeFile(join(root, 'src/routes.ts'), "export const pages = ['/overview', '/activity']; export const actor = 'administrator';");

    const model = await discoverProduct(root);

    expect(model.product).toBe('route-catalog');
    expect(model.actors).toEqual([]);
    expect(model.capabilities).toEqual([]);
    expect(model.journeys).toEqual([]);
    expect(model.proofSurfaces.map((surface) => surface.route)).toEqual(['/overview', '/activity']);
    expect(model.proofSurfaces.every((surface) => surface.evidence[0].type === 'source')).toBe(true);
  });
});
