import { describe, expect, test } from 'vitest';
import {
  ActorOwnershipSchema,
  ConfigSchema,
  EditorialReviewSchema,
  PlanResultSchema,
  ProductModelSchema,
  QualityReportSchema,
  ScenarioSchema
} from '../src/schemas.js';

const source = { type: 'source', path: 'src/workspace.ts', line: 12, detail: 'Declared workflow' };
const runtime = { type: 'runtime', url: 'http://127.0.0.1:4173/workspace', observedAt: '2026-08-02T12:00:00.000Z' };

describe('version 2 contracts', () => {
  test('retains evidence across generic product concepts', () => {
    const model = ProductModelSchema.parse({
      version: 2,
      product: 'Neutral Workspace',
      audiences: [{ id: 'decision-makers', name: 'Decision makers', evidence: [source] }],
      actors: [{ id: 'workspace-owner', name: 'Workspace owner', evidence: [source], session: { required: true, evidence: [source] } }],
      capabilities: [{
        id: 'compare-results', name: 'Compare results', shape: 'read-only', evidence: [source, runtime],
        states: ['unfiltered', 'filtered'], outcomes: ['insight'], proofSurfaces: ['comparison'], safeActions: ['filter']
      }],
      states: [
        { id: 'unfiltered', name: 'Unfiltered results', evidence: [runtime] },
        { id: 'filtered', name: 'Filtered results', evidence: [runtime] }
      ],
      transitions: [{ id: 'apply-filter', fromState: 'unfiltered', toState: 'filtered', actorId: 'workspace-owner', evidence: [runtime] }],
      relationships: [],
      outcomes: [{ id: 'insight', name: 'Visible comparison', evidence: [runtime] }],
      proofSurfaces: [{ id: 'comparison', name: 'Comparison panel', route: '/workspace', evidence: [runtime] }],
      safeActions: [{ id: 'filter', type: 'select', target: { by: 'label', value: 'Time range' }, value: 'week', evidence: [runtime] }],
      asyncBehaviors: [],
      journeys: [{
        id: 'find-insight', name: 'Find an insight', audienceIds: ['decision-makers'], capabilityIds: ['compare-results'], outcomeIds: ['insight'],
        steps: [{ id: 'inspect', capabilityId: 'compare-results', ownership: { status: 'resolved', actorId: 'workspace-owner', evidence: [runtime] } }],
        evidence: [source]
      }]
    });

    expect(model.capabilities[0].shape).toBe('read-only');
    expect(model.journeys[0].steps[0].ownership.status).toBe('resolved');
  });

  test('does not allow resolved actor ownership without evidence', () => {
    expect(() => ActorOwnershipSchema.parse({ status: 'resolved', actorId: 'operator', evidence: [] })).toThrow();
    expect(ActorOwnershipSchema.parse({ status: 'unresolved', reason: 'Authorization evidence missing' }).status).toBe('unresolved');
  });

  test('models structured needs-authoring instead of a fallback scenario', () => {
    const result = PlanResultSchema.parse({
      version: 2,
      status: 'needs-authoring',
      known: [{ claim: 'A route exists', evidence: [source] }],
      unresolved: [{ kind: 'safe-actions', id: 'workspace', reason: 'No meaningful interaction evidence' }],
      sceneBriefs: [{ id: 'workspace-result', purpose: 'result', needs: ['observable outcome'] }],
      missingRuntimeEvidence: ['A result-producing interaction']
    });

    expect(result.status).toBe('needs-authoring');
  });

  test('accepts generic editorial controls and independent audio policy', () => {
    const scenario = ScenarioSchema.parse({
      version: 2,
      id: 'workspace-insight',
      title: 'Workspace insight',
      outputType: 'public-master',
      audience: 'decision-makers',
      locale: 'en',
      audio: { policy: 'music', music: { path: '/tmp/licensed.wav', level: 0.18, fadeInMs: 500, fadeOutMs: 800 } },
      branding: { name: 'Neutral Workspace', primary: '#2563eb', background: '#08111f' },
      actors: [{ id: 'workspace-owner', label: 'Workspace owner' }],
      scenes: [
        { id: 'hook', title: 'See the signal', purpose: 'hook', actor: 'workspace-owner', presentation: { maxStaticHoldMs: 1800, caption: { mode: 'none' } }, actions: [{ type: 'goto', path: '/workspace' }] },
        { id: 'proof', title: 'Compare the result', purpose: 'proof', actor: 'workspace-owner', presentation: { regionOfInterest: { x: 0.4, y: 0.2, width: 0.5, height: 0.5 }, camera: { type: 'zoom', scale: 1.2 }, loading: 'cut', transitionWeight: 'meaningful', caption: { mode: 'lower-third', safeArea: 'bottom' } }, actions: [{ type: 'assert', target: { by: 'text', value: '42%' }, state: 'visible' }] },
        { id: 'close', title: 'Make the decision', purpose: 'close', actor: 'workspace-owner', presentation: { maxStaticHoldMs: 2000 }, actions: [{ type: 'screenshot', name: 'close' }] }
      ]
    });

    expect(scenario.audio.policy).toBe('music');
    expect(scenario.scenes[1].purpose).toBe('proof');
  });

  test('separates technical, editorial, and agent-review status', () => {
    const review = EditorialReviewSchema.parse({
      version: 1,
      tool: 'watch',
      videoPath: '/tmp/workspace.mp4',
      detail: 'balanced',
      transcriptStatus: 'not-required',
      score: 8,
      frames: { distinct: 18, discarded: 4, inspected: 18 },
      assessments: {
        hook: 'Clear promise', narrativeContinuity: 'One journey', staticSections: 'None', readability: 'Readable',
        attentionGuidance: 'Cursor supports focus', overlayObstruction: 'None', transitions: 'Clear', audioTreatment: 'Intentional silence', outcome: 'Visible', closing: 'Deliberate'
      },
      defects: [],
      verdict: 'accept',
      reviewedAt: '2026-08-02T12:30:00.000Z'
    });
    const report = QualityReportSchema.parse({
      version: 2,
      scenarioId: 'workspace-insight',
      status: 'accepted',
      passed: true,
      technical: { passed: true, checks: [] },
      editorial: { passed: true, checks: [], warnings: [] },
      agentReview: { status: 'complete', review },
      sensitiveFindings: [], omittedScenes: []
    });

    expect(report.technical.passed).toBe(true);
    expect(report.agentReview.status).toBe('complete');
  });

  test('keeps local-first configuration defaults and configurable thresholds', () => {
    const config = ConfigSchema.parse({ app: { url: 'http://127.0.0.1:4173' } });
    expect(config.privacy.scanArtifacts).toBe(true);
    expect(config.runtime.rehearsalPasses).toBe(2);
    expect(config.editorial.thresholds['public-master'].distinctWarnRatio).toBe(0.5);
    expect(config.editorial.thresholds['public-master'].distinctFailRatio).toBe(0.4);
  });
});
