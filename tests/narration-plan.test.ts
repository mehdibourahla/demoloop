import { describe, expect, test } from 'vitest';
import { sceneNarrationText, narrationPlan } from '../src/narration.js';
import { ScenarioSchema } from '../src/schemas.js';

function scenario(scenes: unknown[]) {
  return ScenarioSchema.parse({
    version: 2, id: 'narrated', title: 'Narrated', outputType: 'feature-clip', audience: 'operators', locale: 'en', audio: { policy: 'voiceover' },
    actors: [{ id: 'user', label: 'Operator' }], scenes
  });
}

describe('narration text', () => {
  test('joins the scripted action narration in order', () => {
    const [scene] = scenario([{
      id: 'intro', title: 'Welcome', description: 'Ignored when scripted', purpose: 'hook', actor: 'user',
      actions: [{ type: 'goto', path: '/', narration: 'First line.' }, { type: 'assert', target: { by: 'text', value: 'Ready' }, state: 'visible', narration: 'Second line.' }]
    }]).scenes;

    expect(sceneNarrationText(scene)).toBe('First line. Second line.');
  });

  test('falls back to the scene title and description', () => {
    const [scene] = scenario([{ id: 'intro', title: 'Welcome', description: 'A narrated scene', purpose: 'hook', actor: 'user', actions: [{ type: 'goto', path: '/' }] }]).scenes;

    expect(sceneNarrationText(scene)).toBe('Welcome. A narrated scene');
  });
});

describe('narration plan', () => {
  test('measures every scene before capture starts', async () => {
    const plan = await narrationPlan(scenario([
      { id: 'one', title: 'One', purpose: 'hook', actor: 'user', actions: [{ type: 'goto', path: '/' }] },
      { id: 'two', title: 'Two', purpose: 'proof', actor: 'user', actions: [{ type: 'goto', path: '/' }] }
    ]), { synthesize: async (segment) => ({ path: segment.outputPath, durationSeconds: segment.text.length / 10 }) }, '/tmp/plan-cache');

    expect(plan).toEqual({ one: 0.3, two: 0.3 });
  });

  test('is empty when the scenario is silent', async () => {
    const silent = ScenarioSchema.parse({
      version: 2, id: 'silent', title: 'Silent', outputType: 'feature-clip', audience: 'operators', audio: { policy: 'silent' },
      actors: [{ id: 'user', label: 'Operator' }],
      scenes: [{ id: 'one', title: 'One', purpose: 'hook', actor: 'user', actions: [{ type: 'goto', path: '/' }] }]
    });

    expect(await narrationPlan(silent, undefined, '/tmp/plan-cache')).toEqual({});
  });

  test('fails loudly when voiceover has no provider', async () => {
    await expect(narrationPlan(scenario([{ id: 'one', title: 'One', purpose: 'hook', actor: 'user', actions: [{ type: 'goto', path: '/' }] }]), undefined, '/tmp/plan-cache'))
      .rejects.toThrow(/narration provider/i);
  });
});
