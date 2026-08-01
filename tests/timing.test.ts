import { describe, expect, test } from 'vitest';
import { actionDelay, cursorMotion, cursorPath } from '../src/timing.js';

describe('human timing', () => {
  test('creates a curved path with exact endpoints', () => {
    const path = cursorPath({ x: 10, y: 20 }, { x: 110, y: 80 }, 5);
    expect(path).toHaveLength(6);
    expect(path[0]).toEqual({ x: 10, y: 20 });
    expect(path[5]).toEqual({ x: 110, y: 80 });
    expect(path[2].y).not.toBe(44);
  });

  test('typing duration depends on text while result pauses are longer than click dwell', () => {
    expect(actionDelay('fill', 'longer sentence')).toBeGreaterThan(actionDelay('fill', 'hi'));
    expect(actionDelay('result')).toBeGreaterThan(actionDelay('click'));
  });

  test('schedules a curved cursor journey for an exact duration', () => {
    const motion = cursorMotion({ x: 10, y: 20 }, { x: 410, y: 220 }, 600);
    expect(motion[0].point).toEqual({ x: 10, y: 20 });
    expect(motion.at(-1)?.point).toEqual({ x: 410, y: 220 });
    expect(motion.reduce((total, entry) => total + entry.waitAfterMs, 0)).toBeCloseTo(600, 6);
    expect(motion.length).toBeGreaterThan(20);
  });
});
