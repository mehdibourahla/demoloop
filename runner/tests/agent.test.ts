import { expect, test } from 'vitest';
import { runOnce, type AgentDeps, type LeasedJob } from '../src/agent.js';

const leased: LeasedJob = {
  job: { id: 'job-1', kind: 'capture', payload: { scenario: {}, config: {} }, attempt: 1 },
  lease_token: 'token-1',
  lease_seconds: 60
};

function deps(overrides: Partial<AgentDeps>): AgentDeps {
  return { lease: async () => leased, beat: async () => true, capture: async () => ({}), finish: async () => {}, ...overrides };
}

test('reports idle when the queue is empty', async () => {
  expect(await runOnce(deps({ lease: async () => undefined }))).toBe('idle');
});

test('withholds a capture that caught a credential', async () => {
  const reported: Array<Record<string, unknown>> = [];

  const result = await runOnce(deps({
    capture: async () => ({ passed: true, sensitiveFindings: [{ kind: 'secret', source: 'text-login', count: 1 }] }),
    finish: async (_id, _token, body) => { reported.push(body); }
  }));

  expect(result).toBe('withheld');
  expect(JSON.stringify(reported)).toContain('withheld');
  expect(JSON.stringify(reported)).not.toContain('text-login');
});

test('reports a capture that only saw personal data', async () => {
  const reported: Array<Record<string, unknown>> = [];

  const result = await runOnce(deps({
    capture: async () => ({ passed: true, sensitiveFindings: [{ kind: 'email', source: 'text-contacts', count: 3 }] }),
    finish: async (_id, _token, body) => { reported.push(body); }
  }));

  expect(result).toBe('completed');
  expect((reported[0].result as { passed: boolean }).passed).toBe(true);
});

test('holds the lease while a long capture runs', async () => {
  const beats: string[] = [];

  await runOnce(deps({
    beat: async (id) => { beats.push(id); return true; },
    capture: async () => { await new Promise((wait) => setTimeout(wait, 120)); return {}; }
  }), 40);

  expect(beats.length).toBeGreaterThanOrEqual(2);
  expect(beats.every((id) => id === 'job-1')).toBe(true);
});

test('stops beating once the capture returns', async () => {
  let beats = 0;

  await runOnce(deps({ beat: async () => { beats += 1; return true; } }), 20);
  const settled = beats;
  await new Promise((wait) => setTimeout(wait, 80));

  expect(beats).toBe(settled);
});
