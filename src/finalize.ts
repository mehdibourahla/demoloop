import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { QualityReportSchema, type EditorialReview, type QualityReport, type Scenario } from './schemas.js';

export async function finalizeQuality(quality: QualityReport, review: EditorialReview, options: { videoPath: string; audioPolicy: Scenario['audio']['policy'] }): Promise<QualityReport> {
  if (resolve(review.videoPath) !== resolve(options.videoPath)) throw new Error('Watch review must reference the actual final MP4');
  const actualSha256 = createHash('sha256').update(await readFile(resolve(options.videoPath))).digest('hex');
  if (review.videoSha256 !== actualSha256) throw new Error(`Watch review checksum ${review.videoSha256} does not match the final MP4 checksum ${actualSha256}; review the current render`);
  if ((options.audioPolicy === 'voiceover' || options.audioPolicy === 'voiceover-and-music') && review.transcriptStatus !== 'available') throw new Error('A voiced video cannot pass editorial review when its transcript is unavailable');
  if (review.frames.inspected < review.frames.distinct) throw new Error('Editorial review must inspect every distinct frame extracted by Watch');
  const deterministicPassed = quality.technical.passed && quality.editorial.passed && quality.omittedScenes.length === 0;
  const reviewPassed = review.verdict === 'accept' && review.score >= 7;
  const accepted = deterministicPassed && reviewPassed;
  return QualityReportSchema.parse({
    ...quality,
    status: accepted ? 'accepted' : 'rejected',
    passed: accepted,
    agentReview: { status: 'complete', review },
  });
}
