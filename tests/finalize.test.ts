import { describe, expect, test } from 'vitest';
import { finalizeQuality } from '../src/finalize.js';
import { EditorialReviewSchema, QualityReportSchema } from '../src/schemas.js';

const quality = QualityReportSchema.parse({
  version: 2, scenarioId: 'workspace-insight', status: 'pending-agent-review', passed: false,
  technical: { passed: true, checks: [] }, editorial: { passed: true, checks: [], warnings: [] },
  agentReview: { status: 'missing', reason: 'Watch has not run' }, sensitiveFindings: [], omittedScenes: [],
});

function review(overrides: Record<string, unknown> = {}) {
  return EditorialReviewSchema.parse({
    version: 1, tool: 'watch', videoPath: '/tmp/final.mp4', detail: 'balanced', resolution: 1024,
    transcriptStatus: 'not-required', score: 8, frames: { distinct: 12, discarded: 3, inspected: 12 },
    assessments: { hook: 'Immediate promise', narrativeContinuity: 'Causal', staticSections: 'None', readability: 'Readable', attentionGuidance: 'Natural cursor', overlayObstruction: 'None', transitions: 'Purposeful', audioTreatment: 'Intentional silence', outcome: 'Visible', closing: 'Deliberate' },
    defects: [], verdict: 'accept', reviewedAt: '2026-08-02T12:30:00.000Z', ...overrides,
  });
}

describe('Watch finalization gate', () => {
  test('accepts only a matching Watch review scoring at least seven', () => {
    const result = finalizeQuality(quality, review(), { videoPath: '/tmp/final.mp4', audioPolicy: 'silent' });
    expect(result.status).toBe('accepted');
    expect(result.passed).toBe(true);
  });

  test('rejects low scores, path mismatches, and unavailable voiced transcripts', () => {
    expect(finalizeQuality(quality, review({ score: 6.9, verdict: 'reject' }), { videoPath: '/tmp/final.mp4', audioPolicy: 'silent' }).status).toBe('rejected');
    expect(() => finalizeQuality(quality, review(), { videoPath: '/tmp/other.mp4', audioPolicy: 'silent' })).toThrow(/actual final MP4/i);
    expect(() => finalizeQuality(quality, review({ transcriptStatus: 'unavailable' }), { videoPath: '/tmp/final.mp4', audioPolicy: 'voiceover' })).toThrow(/transcript/i);
  });
});
