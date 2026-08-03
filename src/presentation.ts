import type { Scenario } from './schemas.js';

export interface PixelRegion { x: number; y: number; width: number; height: number }

function intersects(a: PixelRegion, b: PixelRegion): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function presentationLayout(presentation: Scenario['scenes'][number]['presentation'], width: number, height: number) {
  const viewport: PixelRegion = { x: 0, y: 0, width, height };
  if (presentation.caption.mode === 'none') return { viewport, obstructions: [] as PixelRegion[] };
  const railHeight = Math.min(96, Math.round(height * 0.12));
  const safeArea = presentation.caption.safeArea ?? 'bottom';
  const caption: PixelRegion = safeArea === 'top'
    ? { x: Math.round(width * 0.04), y: Math.round(height * 0.03), width: Math.round(width * 0.72), height: railHeight }
    : safeArea === 'left'
      ? { x: Math.round(width * 0.03), y: Math.round(height * 0.7), width: Math.round(width * 0.42), height: railHeight }
      : safeArea === 'right'
        ? { x: Math.round(width * 0.55), y: Math.round(height * 0.7), width: Math.round(width * 0.42), height: railHeight }
        : { x: Math.round(width * 0.04), y: height - railHeight - Math.round(height * 0.03), width: Math.round(width * 0.72), height: railHeight };
  const roi = presentation.regionOfInterest ? {
    x: presentation.regionOfInterest.x * width, y: presentation.regionOfInterest.y * height,
    width: presentation.regionOfInterest.width * width, height: presentation.regionOfInterest.height * height,
  } : undefined;
  return { viewport, caption, obstructions: roi && intersects(caption, roi) ? [caption] : [] as PixelRegion[] };
}
