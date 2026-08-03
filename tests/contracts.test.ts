import { describe, expect, test } from 'vitest';
import { ConfigSchema, ProductModelSchema, ScenarioSchema } from '../src/schemas.js';

describe('data contracts', () => {
  test('accepts a complete deterministic scenario', () => {
    const scenario = ScenarioSchema.parse({
      version: 1,
      id: 'patient-to-physician',
      title: 'Patient to physician',
      preconditions: { resetCommand: 'npm run reset', seedCommand: 'npm run seed' },
      actors: [{ id: 'patient', role: 'patient' }, { id: 'physician', role: 'physician' }],
      scenes: [{
        id: 'intake', title: 'Adaptive intake', actor: 'patient',
        actions: [
          { type: 'goto', path: '/patient' },
          { type: 'fill', target: { by: 'label', value: 'Name' }, text: 'Camille Martin', timing: { cursorDurationMs: 620, settleBeforeMs: 180, keystrokeDelayMs: 65, pauseAfterMs: 900 } },
          { type: 'click', target: { by: 'role', role: 'button', value: 'Continue' } },
          { type: 'assert', target: { by: 'text', value: 'Complete' }, state: 'visible' }
        ]
      }]
    });
    expect(scenario.actors).toHaveLength(2);
    expect(scenario.scenes[0].actions[1].timing).toEqual({ cursorDurationMs: 620, settleBeforeMs: 180, keystrokeDelayMs: 65, pauseAfterMs: 900 });
  });

  test('rejects CSS-only final-take locators', () => {
    expect(() => ScenarioSchema.parse({
      version: 1, id: 'bad', title: 'Bad', preconditions: {}, actors: [{ id: 'a', role: 'user' }],
      scenes: [{ id: 's', title: 'S', actor: 'a', actions: [{ type: 'click', target: { by: 'css', value: '.button' } }] }]
    })).toThrow();
  });

  test('requires runtime evidence before demo-ready', () => {
    expect(() => ProductModelSchema.parse({ version: 1, product: 'X', roles: [], routes: [], features: [{ id: 'f', name: 'Feature', demoReady: true, sourceEvidence: [{ path: 'x.ts', line: 1 }] }], journeys: [] })).toThrow();
  });

  test('provides local-first configuration defaults', () => {
    const config = ConfigSchema.parse({ app: { url: 'http://127.0.0.1:4173' } });
    expect(config.privacy.syntheticData).toBe(true);
    expect(config.runtime.rehearsalPasses).toBe(2);
    expect(config.upload.enabled).toBe(false);
  });

  test('accepts macOS-local narration without an API key', () => {
    const config = ConfigSchema.parse({
      app: { url: 'http://127.0.0.1:3005' },
      narration: { provider: 'macos', macos: { voice: 'Samantha' } }
    });

    expect(config.narration).toMatchObject({ provider: 'macos', macos: { voice: 'Samantha' } });
  });
});
