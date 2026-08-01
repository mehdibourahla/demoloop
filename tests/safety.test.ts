import { describe, expect, test } from 'vitest';
import { assertSafeTarget, scanSensitiveText } from '../src/safety.js';

describe('privacy guard', () => {
  test('allows loopback and refuses production-like hosts', () => {
    expect(() => assertSafeTarget('http://127.0.0.1:4173')).not.toThrow();
    expect(() => assertSafeTarget('https://app.example.com')).toThrow(/production/i);
    expect(() => assertSafeTarget('https://app.example.com', true)).not.toThrow();
  });

  test('finds secrets and personal identifiers', () => {
    const findings = scanSensitiveText('email real.person@example.com token sk-live-12345678901234567890 health card ABCD-1234-5678');
    expect(findings.map((f) => f.kind)).toEqual(expect.arrayContaining(['email', 'secret', 'health-id']));
  });
});
