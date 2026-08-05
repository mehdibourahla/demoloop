import { expect, test } from 'vitest';
import { runOnce, type AgentDeps, type LeasedJob } from '../src/agent.js';

const leased: LeasedJob = {
  job: { id: 'job-1', kind: 'capture', payload: { scenario: {}, config: {} }, attempt: 1 },
  lease_token: 'token-1',
  lease_seconds: 60
};

function deps(overrides: Partial<AgentDeps>): AgentDeps {
  return { lease: async () => leased, capture: async () => ({}), finish: async () => {}, ...overrides };
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
