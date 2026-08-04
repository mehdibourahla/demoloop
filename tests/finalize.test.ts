import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import { finalizeQuality } from '../src/finalize.js';
import { EditorialReviewSchema, QualityReportSchema } from '../src/schemas.js';

const quality = QualityReportSchema.parse({
  version: 2, scenarioId: 'workspace-insight', status: 'pending-agent-review', passed: false,
  technical: { passed: true, checks: [] }, editorial: { passed: true, checks: [], warnings: [] },
  agentReview: { status: 'missing', reason: 'Watch has not run' }, sensitiveFindings: [], omittedScenes: [],
});

let videoPath: string;
let videoSha256: string;

beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'demoloop-finalize-'));
  videoPath = join(directory, 'final.mp4');
  await writeFile(videoPath, 'reviewed video bytes');
  videoSha256 = createHash('sha256').update('reviewed video bytes').digest('hex');
});

function review(overrides: Record<string, unknown> = {}) {
  return EditorialReviewSchema.parse({
    version: 1, tool: 'watch', videoPath, videoSha256, detail: 'balanced', resolution: 1024,
    transcriptStatus: 'not-required', score: 8, frames: { distinct: 12, discarded: 3, inspected: 12 },
    assessments: { hook: 'Immediate promise', narrativeContinuity: 'Causal', staticSections: 'None', readability: 'Readable', attentionGuidance: 'Natural cursor', overlayObstruction: 'None', transitions: 'Purposeful', audioTreatment: 'Intentional silence', outcome: 'Visible', closing: 'Deliberate' },
    defects: [], verdict: 'accept', reviewedAt: '2026-08-02T12:30:00.000Z', ...overrides,
  });
}

describe('Watch finalization gate', () => {
  test('accepts only a matching Watch review scoring at least seven', async () => {
    const result = await finalizeQuality(quality, review(), { videoPath, audioPolicy: 'silent' });
    expect(result.status).toBe('accepted');
    expect(result.passed).toBe(true);
  });

  test('rejects low scores, path mismatches, and unavailable voiced transcripts', async () => {
    expect((await finalizeQuality(quality, review({ score: 6.9, verdict: 'reject' }), { videoPath, audioPolicy: 'silent' })).status).toBe('rejected');
    await expect(finalizeQuality(quality, review(), { videoPath: '/tmp/other.mp4', audioPolicy: 'silent' })).rejects.toThrow(/actual final MP4/i);
    await expect(finalizeQuality(quality, review({ transcriptStatus: 'unavailable' }), { videoPath, audioPolicy: 'voiceover' })).rejects.toThrow(/transcript/i);
  });

  test('refuses a review of different bytes at the same path', async () => {
    const stale = review({ videoSha256: createHash('sha256').update('an earlier render').digest('hex') });

    await expect(finalizeQuality(quality, stale, { videoPath, audioPolicy: 'silent' })).rejects.toThrow(/checksum/i);
  });
});
