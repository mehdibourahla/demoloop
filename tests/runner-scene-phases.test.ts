import { describe, expect, test } from 'vitest';
import { sceneActionPhases } from '../src/runner.js';
import type { Action } from '../src/schemas.js';

const actions: Action[] = [
  { type: 'goto', path: '/dashboard' },
  { type: 'assert', target: { by: 'text', value: 'Ready' }, state: 'visible' }
];

describe('recording scene phases', () => {
  test('preloads only a leading navigation before capture', () => {
    expect(sceneActionPhases('record', actions)).toEqual({
      preload: [actions[0]],
      capture: [actions[1]],
      captureOffset: 1
    });
  });

  test('keeps every action in the captured phase during rehearsal', () => {
    expect(sceneActionPhases('rehearse', actions)).toEqual({
      preload: [],
      capture: actions,
      captureOffset: 0
    });
  });
});
