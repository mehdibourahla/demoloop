import { describe, expect, test } from 'vitest';
import { validateScenarioEditorially } from '../src/editorial-validation.js';
import { planDemo } from '../src/planner.js';
import { ProductModelSchema, ScenarioSchema, type ProductModel } from '../src/schemas.js';

const source = { type: 'source' as const, path: 'src/workspace.ts', line: 10, detail: 'Declared workflow' };
const runtime = { type: 'runtime' as const, url: 'http://127.0.0.1:4173/workspace', observedAt: '2026-08-02T12:00:00.000Z' };

function model(overrides: Partial<ProductModel> = {}): ProductModel {
  return ProductModelSchema.parse({
    version: 2,
    product: 'Signal Desk',
    audiences: [{ id: 'reviewers', name: 'Reviewers', evidence: [source] }],
    actors: [{ id: 'review-console', name: 'Review console', evidence: [source] }],
    capabilities: [{ id: 'find-signal', name: 'Find signal', shape: 'read-only', evidence: [source, runtime], states: [], outcomes: ['signal-visible'], proofSurfaces: ['signal-panel'], safeActions: ['open-panel', 'filter', 'prove'] }],
    states: [], transitions: [], relationships: [],
    outcomes: [{ id: 'signal-visible', name: 'Signal visible', evidence: [runtime] }],
    proofSurfaces: [{ id: 'signal-panel', name: 'Signal panel', route: '/workspace', evidence: [runtime] }],
    safeActions: [
      { id: 'open-panel', type: 'goto', path: '/workspace', evidence: [runtime] },
      { id: 'filter', type: 'select', target: { by: 'label', value: 'Window' }, value: 'week', evidence: [runtime] },
      { id: 'prove', type: 'assert', target: { by: 'text', value: '42%' }, state: 'visible', evidence: [runtime] }
    ],
    asyncBehaviors: [],
    journeys: [{ id: 'review-signal', name: 'Review signal', audienceIds: ['reviewers'], capabilityIds: ['find-signal'], outcomeIds: ['signal-visible'], steps: [{ id: 'inspect', capabilityId: 'find-signal', ownership: { status: 'resolved', actorId: 'review-console', evidence: [runtime] }, proofSurfaceId: 'signal-panel', safeActionIds: ['open-panel', 'filter', 'prove'] }], evidence: [source] }],
    ...overrides
  });
}

describe('capability-aware planning', () => {
  test('returns needs-authoring when actor ownership is unresolved', () => {
    const unresolved = model({ journeys: [{ id: 'review-signal', name: 'Review signal', audienceIds: ['reviewers'], capabilityIds: ['find-signal'], outcomeIds: ['signal-visible'], steps: [{ id: 'inspect', capabilityId: 'find-signal', ownership: { status: 'unresolved', reason: 'Session evidence missing' }, safeActionIds: ['filter'] }], evidence: [source] }] });

    const result = planDemo(unresolved, { mode: 'journey', journeyId: 'review-signal' });

    expect(result.status).toBe('needs-authoring');
    if (result.status === 'needs-authoring') expect(result.unresolved).toContainEqual(expect.objectContaining({ kind: 'actor', id: 'inspect' }));
  });

  test('does not turn route-only evidence into a public master', () => {
    const routeOnly = model({ actors: [], capabilities: [], outcomes: [], safeActions: [], journeys: [] });

    const result = planDemo(routeOnly, { mode: 'full' });

    expect(result.status).toBe('needs-authoring');
    if (result.status === 'needs-authoring') expect(result.unresolved).toContainEqual(expect.objectContaining({ kind: 'safe-actions' }));
  });

  test('allows a read-only insight journey without write actions', () => {
    const result = planDemo(model(), { mode: 'journey', journeyId: 'review-signal' });

    expect(result.status).toBe('planned');
    if (result.status !== 'planned') return;
    const scenario = result.outputs[0];
    expect(scenario.outputType).toBe('actor-journey');
    expect(scenario.scenes.flatMap((scene) => scene.actions).some((action) => action.type === 'fill')).toBe(false);
    expect(scenario.scenes.some((scene) => scene.purpose === 'proof')).toBe(true);
  });

  test('uses evidence-backed ownership for every step instead of array position', () => {
    const handoff = model({
      actors: [{ id: 'origin-console', name: 'Origin console', evidence: [source] }, { id: 'destination-console', name: 'Destination console', evidence: [source] }],
      capabilities: [
        { id: 'send-item', name: 'Send item', shape: 'stateful', evidence: [runtime], states: [], outcomes: ['signal-visible'], proofSurfaces: ['signal-panel'], safeActions: ['open-panel', 'filter'] },
        { id: 'receive-item', name: 'Receive item', shape: 'stateful', evidence: [runtime], states: [], outcomes: ['signal-visible'], proofSurfaces: ['signal-panel'], safeActions: ['prove'] }
      ],
      relationships: [{ id: 'delivery', fromActorId: 'origin-console', toActorId: 'destination-console', description: 'Item delivery', evidence: [runtime] }],
      journeys: [{ id: 'handoff-item', name: 'Handoff item', audienceIds: ['reviewers'], capabilityIds: ['send-item', 'receive-item'], outcomeIds: ['signal-visible'], steps: [
        { id: 'send', capabilityId: 'send-item', ownership: { status: 'resolved', actorId: 'origin-console', evidence: [runtime] }, safeActionIds: ['open-panel', 'filter'] },
        { id: 'receive', capabilityId: 'receive-item', ownership: { status: 'resolved', actorId: 'destination-console', evidence: [runtime] }, proofSurfaceId: 'signal-panel', safeActionIds: ['prove'] }
      ], evidence: [runtime] }]
    });

    const result = planDemo(handoff, { mode: 'journey', journeyId: 'handoff-item' });

    expect(result.status).toBe('planned');
    if (result.status !== 'planned') return;
    expect(result.outputs[0].scenes.filter((scene) => ['interaction', 'state-change', 'handoff', 'proof'].includes(scene.purpose)).map((scene) => scene.actor)).toEqual(['origin-console', 'destination-console']);
    expect(result.outputs[0].scenes.find((scene) => scene.actor === 'destination-console')?.causalLink?.relationshipId).toBe('delivery');
  });

  test('full mode emits a concise public master, clips, and coverage separately', () => {
    const result = planDemo(model(), { mode: 'full' });

    expect(result.status).toBe('planned');
    if (result.status !== 'planned') return;
    expect(result.outputs.some((output) => output.outputType === 'public-master')).toBe(true);
    expect(result.outputs.some((output) => output.outputType === 'actor-journey')).toBe(true);
    const master = result.outputs.find((output) => output.outputType === 'public-master')!;
    expect(master.scenes[0].purpose).toBe('hook');
    expect(master.scenes.at(-1)?.purpose).toBe('close');
    expect(result.coverage).toContainEqual(expect.objectContaining({ capabilityId: 'find-signal' }));
  });

  test('semantic validation rejects public masters without a close', () => {
    const planned = planDemo(model(), { mode: 'full' });
    if (planned.status !== 'planned') throw new Error('expected plan');
    const master = planned.outputs.find((output) => output.outputType === 'public-master')!;
    const invalid = ScenarioSchema.parse({ ...master, scenes: master.scenes.filter((scene) => scene.purpose !== 'close') });

    expect(validateScenarioEditorially(invalid, model())).toContainEqual(expect.objectContaining({ code: 'missing-close' }));
  });
});
