import { describe, expect, test } from 'vitest';
import { canRecord, scenarioDigest } from '../src/receipt.js';

describe('rehearsal receipt', () => {
  test('permits recording only after two consecutive passes of the exact scenario', async () => {
    const digest = await scenarioDigest({ id: 'a', scenes: [] });
    expect(canRecord(digest, { scenarioDigest: digest, consecutivePasses: 2, passed: true })).toBe(true);
    expect(canRecord(digest, { scenarioDigest: digest, consecutivePasses: 1, passed: true })).toBe(false);
    expect(canRecord(digest, { scenarioDigest: 'stale', consecutivePasses: 2, passed: true })).toBe(false);
  });

  test('digest is stable across object key order', async () => {
    expect(await scenarioDigest({ b: 2, a: 1 })).toBe(await scenarioDigest({ a: 1, b: 2 }));
  });
});
