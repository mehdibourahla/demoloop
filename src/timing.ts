export interface Point { x: number; y: number }

export function cursorPath(from: Point, to: Point, steps: number): Point[] {
  if (!Number.isInteger(steps) || steps < 1) throw new Error('steps must be a positive integer');
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const bend = Math.min(48, distance * 0.14);
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps;
    const eased = t * t * (3 - 2 * t);
    return { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased - Math.sin(Math.PI * t) * bend };
  });
}

export function cursorMotion(from: Point, to: Point, durationMs: number, frameMs = 20): Array<{ point: Point; waitAfterMs: number }> {
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('durationMs must be positive');
  if (!Number.isFinite(frameMs) || frameMs <= 0) throw new Error('frameMs must be positive');
  const steps = Math.max(1, Math.ceil(durationMs / frameMs));
  const waitAfterMs = durationMs / steps;
  return cursorPath(from, to, steps).map((point, index) => ({ point, waitAfterMs: index === 0 ? 0 : waitAfterMs }));
}

export function scrollMotion(deltaY: number, durationMs?: number, frameMs = 16): Array<{ deltaY: number; waitAfterMs: number }> {
  if (!Number.isFinite(deltaY)) throw new Error('deltaY must be finite');
  durationMs ??= Math.max(420, Math.min(900, 420 + Math.abs(deltaY) * 0.25));
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('durationMs must be positive');
  if (!Number.isFinite(frameMs) || frameMs <= 0) throw new Error('frameMs must be positive');
  const steps = Math.max(12, Math.ceil(durationMs / frameMs));
  const waitAfterMs = durationMs / steps;
  let previous = 0;
  return Array.from({ length: steps }, (_, index) => {
    const t = (index + 1) / steps;
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const position = deltaY * eased;
    const increment = position - previous;
    previous = position;
    return { deltaY: increment, waitAfterMs };
  });
}

export function actionDelay(action: string, text = ''): number {
  if (action === 'fill') return 320 + Math.min(2400, text.length * 42);
  if (action === 'result') return 900;
  if (action === 'scroll') return 650;
  if (action === 'chapter') return 1200;
  return 420;
}
