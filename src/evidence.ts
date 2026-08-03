import type { Evidence } from './schemas.js';

export function sourceEvidence(path: string, line?: number, detail?: string): Evidence {
  return { type: 'source', path, ...(line ? { line } : {}), ...(detail ? { detail } : {}) };
}

export function runtimeEvidence(url: string, observedAt: string, artifacts: { screenshot?: string; ariaSnapshot?: string } = {}): Evidence {
  return { type: 'runtime', url, observedAt, ...artifacts };
}
