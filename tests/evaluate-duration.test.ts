import { describe, expect, test } from 'vitest';
import { durationCheck, passiveScenes, reviewMoments } from '../src/evaluate.js';

describe('review moments', () => {
  test('samples after a cut has settled rather than on the transition frame', () => {
    expect(reviewMoments(20, [{ outputSeconds: 7.3, kind: 'scene' }, { outputSeconds: 12, kind: 'trim' }], []))
      .toEqual([1, 7.7, 12.4, 19.5]);
  });

  test('keeps static spans and drops moments past the end', () => {
    expect(reviewMoments(10, [{ outputSeconds: 9.9, kind: 'scene' }], [{ startSeconds: 4 }]))
      .toEqual([1, 4, 9.5]);
  });
});

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

describe('passive scenes', () => {
  const scene = (id: string, types: string[]) => ({ id, actions: types.map((type) => ({ type })) });

  test('names the scenes that only look at a page', () => {
    expect(passiveScenes([scene('look', ['goto', 'assert']), scene('do', ['goto', 'fill', 'click'])])).toEqual(['look']);
  });

  test('counts scrolling and waiting as passive', () => {
    expect(passiveScenes([scene('browse', ['goto', 'scroll', 'waitFor', 'assert'])])).toEqual(['browse']);
  });

  test('treats a demonstrated scene as active', () => {
    expect(passiveScenes([scene('pick', ['choose'])])).toEqual([]);
  });
});
