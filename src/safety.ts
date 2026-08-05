import { readFile } from 'node:fs/promises';

export interface SensitiveFinding { kind: string; source: string; count: number }

export function assertSafeTarget(url: string, allowProduction = false): void {
  const target = new URL(url);
  const local = target.hostname === 'localhost' || target.hostname === '127.0.0.1' || target.hostname === '::1';
  const nonProduction = /(^|\.)((dev|test|staging|preview)\.)/i.test(target.hostname) || /[.-](dev|test|staging|preview)[.-]/i.test(target.hostname);
  if (!allowProduction && !local && !nonProduction) throw new Error(`Refusing production-like target ${target.origin}; set allowProduction explicitly`);
}

export async function scanCaptureArtifacts(artifacts: Record<string, string>): Promise<SensitiveFinding[]> {
  const findings: SensitiveFinding[] = [];
  for (const [key, path] of Object.entries(artifacts)) {
    if (!key.startsWith('text-')) continue;
    findings.push(...scanSensitiveText(await readFile(path, 'utf8'), key));
  }
  return findings;
}

export function scanSensitiveText(text: string, source: string): SensitiveFinding[] {
  const patterns: Array<[string, RegExp]> = [
    ['secret', /\b(?:sk|pk|api)[-_](?:live|prod)?[-_]?[A-Za-z0-9]{16,}\b/gi],
    ['email', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
    ['phone', /\b(?:\+?1[-. ]?)?\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b/g],
    ['health-id', /\b[A-Z]{4}-\d{4}-\d{4}\b/g]
  ];
  return patterns.flatMap(([kind, pattern]) => {
    const count = [...text.matchAll(pattern)].length;
    return count ? [{ kind, source, count }] : [];
  });
}
