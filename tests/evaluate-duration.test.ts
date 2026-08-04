import { describe, expect, test } from 'vitest';
import { durationCheck } from '../src/evaluate.js';

describe('duration check', () => {
  test('bounds an unconstrained demo to a sane absolute window', () => {
    expect(durationCheck(45).passed).toBe(true);
    expect(durationCheck(0.5).passed).toBe(false);
    expect(durationCheck(200).passed).toBe(false);
  });

  test('measures against the requested duration when the plan states one', () => {
    expect(durationCheck(120, 120).passed).toBe(true);
    expect(durationCheck(140, 120).passed).toBe(true);
    expect(durationCheck(200, 120).passed).toBe(false);
    expect(durationCheck(40, 120).passed).toBe(false);
    expect(durationCheck(200, 240).passed).toBe(true);
  });

  test('reports the requested target in its detail', () => {
    expect(durationCheck(200, 120).detail).toContain('120');
  });
});
