import type { Scenario } from './schemas.js';

export interface PixelRegion { x: number; y: number; width: number; height: number }

function intersects(a: PixelRegion, b: PixelRegion): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function presentationLayout(presentation: Scenario['scenes'][number]['presentation'], width: number, height: number) {
  const viewport: PixelRegion = { x: 0, y: 0, width, height };
  if (presentation.caption.mode === 'none') return { viewport, obstructions: [] as PixelRegion[] };
  const railHeight = Math.min(96, Math.round(height * 0.12));
  const inset = Math.round(height * 0.035);
  const left = Math.round(width * 0.04);
  const caption: PixelRegion = { x: left, y: presentation.caption.safeArea === 'top' ? inset : height - railHeight - inset, width: Math.round(width * 0.8) - left, height: railHeight };
  const roi = presentation.regionOfInterest ? {
    x: presentation.regionOfInterest.x * width, y: presentation.regionOfInterest.y * height,
    width: presentation.regionOfInterest.width * width, height: presentation.regionOfInterest.height * height,
  } : undefined;
  return { viewport, caption, obstructions: roi && intersects(caption, roi) ? [caption] : [] as PixelRegion[] };
}
