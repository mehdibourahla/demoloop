import { describe, expect, test } from 'vitest';
import { presentationLayout } from '../src/presentation.js';

describe('presentation layout', () => {
  test('keeps the product dominant and caption outside the region of interest', () => {
    const layout = presentationLayout({
      maxStaticHoldMs: 3_000,
      regionOfInterest: { x: 0.1, y: 0.05, width: 0.7, height: 0.25 },
      camera: { type: 'zoom', scale: 1.25 }, loading: 'cut', transitionWeight: 'meaningful',
      caption: { mode: 'lower-third', safeArea: 'bottom' },
    }, 1440, 900);
    expect(layout.viewport.width * layout.viewport.height / (1440 * 900)).toBeGreaterThanOrEqual(0.7);
    expect(layout.caption).toBeDefined();
    expect(layout.obstructions).toEqual([]);
  });

  test('describes the caption box Remotion actually draws', () => {
    const layout = presentationLayout({
      maxStaticHoldMs: 3_000, camera: { type: 'none' }, loading: 'cut', transitionWeight: 'light',
      caption: { mode: 'lower-third', safeArea: 'bottom' },
    }, 1440, 900);

    expect(layout.caption!.x).toBe(Math.round(1440 * 0.04));
    expect(layout.caption!.x + layout.caption!.width).toBe(Math.round(1440 * 0.8));
    expect(layout.caption!.y + layout.caption!.height).toBeGreaterThanOrEqual(900 - Math.round(900 * 0.035));
  });

  test('adds no overlay when captions are disabled', () => {
    const layout = presentationLayout({ maxStaticHoldMs: 3_000, camera: { type: 'none' }, loading: 'cut', transitionWeight: 'light', caption: { mode: 'none' } }, 390, 844);
    expect(layout.caption).toBeUndefined();
    expect(layout.viewport.width * layout.viewport.height / (390 * 844)).toBeGreaterThanOrEqual(0.7);
  });
});
