export interface LeasedJob {
  job: { id: string; kind: string; payload: Record<string, unknown>; attempt: number };
  lease_token: string;
  lease_seconds: number;
}

export interface AgentDeps {
  lease(kinds: string[]): Promise<LeasedJob | undefined>;
  beat(id: string, token: string): Promise<boolean>;
  upload(artifacts: Record<string, string>): Promise<Record<string, string>>;
  capture(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
  finish(id: string, token: string, body: Record<string, unknown>): Promise<void>;
}

export type RunOutcome = 'idle' | 'completed' | 'withheld';

export async function runOnce(deps: AgentDeps, beatMs = 15_000): Promise<RunOutcome> {
  const leased = await deps.lease(['capture']);
  if (!leased) return 'idle';
  const heartbeat = setInterval(() => { void deps.beat(leased.job.id, leased.lease_token); }, beatMs);
  let report: Record<string, unknown>;
  try {
    report = await deps.capture(leased.job.payload);
  } finally {
    clearInterval(heartbeat);
  }
  const findings = (report.sensitiveFindings ?? []) as Array<{ kind: string }>;
  if (findings.some((finding) => finding.kind === 'secret')) {
    await deps.finish(leased.job.id, leased.lease_token, {
      result: { passed: false, withheld: 'capture caught a credential; no artifacts were uploaded' }
    });
    return 'withheld';
  }
  const artifacts = (report.artifacts ?? {}) as Record<string, string>;
  await deps.finish(leased.job.id, leased.lease_token, { result: { ...report, artifacts: await deps.upload(artifacts) } });
  return 'completed';
}
