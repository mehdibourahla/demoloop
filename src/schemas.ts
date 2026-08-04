import { z } from 'zod';

export const EvidenceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('source'), path: z.string().min(1), line: z.number().int().positive().optional(), detail: z.string().min(1).optional() }),
  z.object({ type: z.literal('runtime'), url: z.string().url(), observedAt: z.string().datetime(), screenshot: z.string().min(1).optional(), ariaSnapshot: z.string().min(1).optional(), detail: z.string().min(1).optional() }),
  z.object({ type: z.literal('user'), confirmedBy: z.string().min(1), confirmedAt: z.string().datetime(), detail: z.string().min(1) })
]);

const EvidenceArraySchema = z.array(EvidenceSchema).min(1);

export const TargetSchema = z.discriminatedUnion('by', [
  z.object({ by: z.literal('role'), role: z.enum(['button', 'link', 'textbox', 'checkbox', 'radio', 'heading', 'combobox', 'listitem', 'tab', 'menuitem']), value: z.string().min(1) }),
  z.object({ by: z.literal('label'), value: z.string().min(1) }),
  z.object({ by: z.literal('testId'), value: z.string().min(1) }),
  z.object({ by: z.literal('text'), value: z.string().min(1) }),
  z.object({ by: z.literal('roleAny'), role: z.enum(['button', 'link', 'textbox', 'checkbox', 'radio', 'heading', 'combobox', 'listitem', 'tab', 'menuitem']), values: z.array(z.string().min(1)).min(2) }),
  z.object({ by: z.literal('rolePattern'), role: z.enum(['button', 'link', 'textbox', 'checkbox', 'radio', 'heading', 'combobox', 'listitem', 'tab', 'menuitem']), pattern: z.string().min(1) }),
  z.object({ by: z.literal('textPattern'), pattern: z.string().min(1) })
]);

export const ActionTimingSchema = z.object({
  cursorDurationMs: z.number().int().min(100).max(2_500).optional(),
  settleBeforeMs: z.number().int().min(0).max(1_500).optional(),
  keystrokeDelayMs: z.number().int().min(0).max(250).optional(),
  pauseAfterMs: z.number().int().min(0).max(5_000).optional()
});

const ActionBase = z.object({
  title: z.string().min(1).optional(),
  narration: z.string().min(1).optional(),
  timing: ActionTimingSchema.optional(),
  optional: z.boolean().optional(),
  timeoutMs: z.number().int().min(1).max(90_000).optional()
});

export const ConditionSchema = z.object({ target: TargetSchema, state: z.enum(['visible', 'hidden']).default('visible') });

const LeafActionSchema = z.discriminatedUnion('type', [
  ActionBase.extend({ type: z.literal('goto'), path: z.string().min(1) }),
  ActionBase.extend({ type: z.literal('click'), target: TargetSchema }),
  ActionBase.extend({ type: z.literal('fill'), target: TargetSchema, text: z.string() }),
  ActionBase.extend({ type: z.literal('select'), target: TargetSchema, value: z.string() }),
  ActionBase.extend({ type: z.literal('scroll'), target: TargetSchema.optional(), deltaY: z.number().optional() }),
  ActionBase.extend({ type: z.literal('assert'), target: TargetSchema, state: z.enum(['visible', 'hidden', 'checked']), text: z.string().optional() }),
  ActionBase.extend({ type: z.literal('waitFor'), target: TargetSchema, state: z.enum(['visible', 'hidden', 'enabled', 'disabled']) }),
  ActionBase.extend({ type: z.literal('choose'), target: TargetSchema, prefer: z.array(z.string().min(1)).default([]), avoid: z.array(z.string().min(1)).default([]), requirePreferred: z.boolean().default(false) }),
  ActionBase.extend({ type: z.literal('screenshot'), name: z.string().min(1) })
]);

export type Condition = z.infer<typeof ConditionSchema>;
export type LeafAction = z.infer<typeof LeafActionSchema>;
export type ActionTiming = z.infer<typeof ActionTimingSchema>;
export type RepeatAction = { type: 'repeat'; title?: string; narration?: string; optional?: boolean; timeoutMs?: number; timing?: ActionTiming; until: Condition; maxIterations: number; actions: Action[] };
export type BranchAction = { type: 'branch'; title?: string; narration?: string; optional?: boolean; timeoutMs?: number; timing?: ActionTiming; when: Condition; then: Action[]; otherwise: Action[] };
export type Action = LeafAction | RepeatAction | BranchAction;

export const ActionSchema: z.ZodType<Action> = z.lazy(() => z.union([
  LeafActionSchema,
  ActionBase.extend({ type: z.literal('repeat'), until: ConditionSchema, maxIterations: z.number().int().min(1).max(50).default(10), actions: z.array(ActionSchema).min(1) }),
  ActionBase.extend({ type: z.literal('branch'), when: ConditionSchema, then: z.array(ActionSchema).min(1), otherwise: z.array(ActionSchema).default([]) })
]));

export const ActorOwnershipSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('resolved'), actorId: z.string().min(1), evidence: EvidenceArraySchema }),
  z.object({ status: z.literal('unresolved'), reason: z.string().min(1), evidence: z.array(EvidenceSchema).default([]) })
]);

const ClaimSchema = z.object({ id: z.string().min(1), name: z.string().min(1), evidence: EvidenceArraySchema });

const SafeActionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['goto', 'click', 'fill', 'select', 'scroll', 'assert', 'waitFor', 'choose', 'screenshot']),
  target: TargetSchema.optional(),
  path: z.string().min(1).optional(),
  value: z.string().optional(),
  text: z.string().optional(),
  state: z.enum(['visible', 'hidden', 'checked']).optional(),
  evidence: EvidenceArraySchema
});

export const ProductModelSchema = z.object({
  version: z.literal(2),
  product: z.string().min(1),
  audiences: z.array(ClaimSchema).default([]),
  actors: z.array(ClaimSchema.extend({ session: z.object({ required: z.boolean(), storageState: z.string().min(1).optional(), evidence: EvidenceArraySchema }).optional() })).default([]),
  capabilities: z.array(ClaimSchema.extend({
    shape: z.enum(['stateful', 'read-only', 'exploratory', 'operational', 'content']),
    states: z.array(z.string()).default([]), outcomes: z.array(z.string()).default([]), proofSurfaces: z.array(z.string()).default([]), safeActions: z.array(z.string()).default([])
  })).default([]),
  states: z.array(ClaimSchema).default([]),
  transitions: z.array(z.object({ id: z.string().min(1), fromState: z.string().min(1), toState: z.string().min(1), actorId: z.string().min(1).optional(), asynchronous: z.boolean().default(false), evidence: EvidenceArraySchema })).default([]),
  relationships: z.array(z.object({ id: z.string().min(1), fromActorId: z.string().min(1), toActorId: z.string().min(1), description: z.string().min(1), evidence: EvidenceArraySchema })).default([]),
  outcomes: z.array(ClaimSchema).default([]),
  proofSurfaces: z.array(ClaimSchema.extend({ route: z.string().min(1).optional(), runtimeUrl: z.string().url().optional() })).default([]),
  safeActions: z.array(SafeActionSchema).default([]),
  asyncBehaviors: z.array(z.object({ id: z.string().min(1), name: z.string().min(1), triggerActionId: z.string().min(1).optional(), loadingState: z.string().min(1).optional(), settledState: z.string().min(1).optional(), evidence: EvidenceArraySchema })).default([]),
  journeys: z.array(ClaimSchema.extend({
    audienceIds: z.array(z.string()).default([]), capabilityIds: z.array(z.string()).min(1), outcomeIds: z.array(z.string()).default([]),
    steps: z.array(z.object({ id: z.string().min(1), capabilityId: z.string().min(1), ownership: ActorOwnershipSchema, transitionId: z.string().min(1).optional(), proofSurfaceId: z.string().min(1).optional(), safeActionIds: z.array(z.string()).default([]) })).min(1)
  })).default([])
});

export const ScenePurposeSchema = z.enum(['hook', 'context', 'interaction', 'exploration', 'state-change', 'handoff', 'result', 'proof', 'montage', 'close']);
export const OutputTypeSchema = z.enum(['public-master', 'actor-journey', 'feature-clip', 'release-demo', 'montage']);

const RegionSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1) }).superRefine((region, context) => {
  if (region.x + region.width > 1) context.addIssue({ code: 'custom', path: ['width'], message: 'region exceeds viewport width' });
  if (region.y + region.height > 1) context.addIssue({ code: 'custom', path: ['height'], message: 'region exceeds viewport height' });
});

export const ScenePresentationSchema = z.object({
  maxStaticHoldMs: z.number().int().min(250).max(15_000).default(3_000),
  regionOfInterest: RegionSchema.optional(),
  camera: z.object({ type: z.enum(['none', 'crop', 'pan', 'zoom']), scale: z.number().min(1).max(3).optional(), to: RegionSchema.optional() }).default({ type: 'none' }),
  loading: z.enum(['preserve', 'cut']).default('cut'),
  transitionWeight: z.enum(['light', 'meaningful', 'major']).default('light'),
  caption: z.object({ mode: z.enum(['none', 'lower-third']), safeArea: z.enum(['top', 'bottom']).optional() }).default({ mode: 'none' })
}).default({ maxStaticHoldMs: 3_000, camera: { type: 'none' }, loading: 'cut', transitionWeight: 'light', caption: { mode: 'none' } });

const MusicSchema = z.object({ path: z.string().min(1), level: z.number().min(0).max(1).default(0.2), fadeInMs: z.number().int().min(0).max(10_000).default(500), fadeOutMs: z.number().int().min(0).max(10_000).default(500) });
export const AudioPolicySchema = z.object({ policy: z.enum(['silent', 'music', 'voiceover', 'voiceover-and-music']), music: MusicSchema.optional() }).superRefine((audio, context) => {
  if ((audio.policy === 'music' || audio.policy === 'voiceover-and-music') && !audio.music) context.addIssue({ code: 'custom', path: ['music'], message: 'music policy requires a local music asset' });
});

export const ScenarioSchema = z.object({
  version: z.literal(2),
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  outputType: OutputTypeSchema,
  audience: z.string().min(1),
  locale: z.string().min(2).default('en'),
  requestedDurationSeconds: z.number().positive().optional(),
  audio: AudioPolicySchema.default({ policy: 'silent' }),
  branding: z.object({ name: z.string().min(1), primary: z.string().min(1), background: z.string().min(1) }).default({ name: 'Product Demo', primary: '#2563eb', background: '#08111f' }),
  preconditions: z.object({ resetCommand: z.string().min(1).optional(), seedCommand: z.string().min(1).optional() }).default({}),
  actors: z.array(z.object({
    id: z.string().min(1), label: z.string().min(1), storageState: z.string().min(1).optional(),
    preflight: z.object({ path: z.string().min(1).default('/'), target: TargetSchema, state: z.enum(['visible', 'hidden']).default('visible'), timeoutMs: z.number().int().min(100).max(120_000).default(10_000) }).optional()
  })).min(1),
  scenes: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]+$/), title: z.string().min(1), description: z.string().min(1).optional(), purpose: ScenePurposeSchema,
    capabilityId: z.string().min(1).optional(), proofSurfaceId: z.string().min(1).optional(),
    actor: z.string().min(1), causalLink: z.object({ fromSceneId: z.string().min(1), relationshipId: z.string().min(1).optional(), transitionId: z.string().min(1).optional(), evidence: EvidenceArraySchema }).optional(),
    presentation: ScenePresentationSchema, actions: z.array(ActionSchema).min(1)
  })).min(1)
}).superRefine((scenario, context) => {
  const actors = new Set(scenario.actors.map((actor) => actor.id));
  scenario.scenes.forEach((scene, index) => {
    if (!actors.has(scene.actor)) context.addIssue({ code: 'custom', path: ['scenes', index, 'actor'], message: 'scene actor must be declared' });
  });
});

const CoverageSchema = z.object({ capabilityId: z.string().min(1), outputIds: z.array(z.string()), omissionReason: z.string().min(1).optional() });
const OmissionSchema = z.object({ id: z.string().min(1), reason: z.string().min(1), evidence: z.array(EvidenceSchema).default([]) });

export const PlanResultSchema = z.discriminatedUnion('status', [
  z.object({ version: z.literal(2), status: z.literal('planned'), outputs: z.array(ScenarioSchema).min(1), coverage: z.array(CoverageSchema), omissions: z.array(OmissionSchema).default([]) }),
  z.object({
    version: z.literal(2), status: z.literal('needs-authoring'),
    known: z.array(z.object({ claim: z.string().min(1), evidence: EvidenceArraySchema })),
    unresolved: z.array(z.object({ kind: z.enum(['audience', 'actor', 'safe-actions', 'outcome', 'proof', 'relationship', 'runtime']), id: z.string().min(1), reason: z.string().min(1), evidence: z.array(EvidenceSchema).default([]) })),
    sceneBriefs: z.array(z.object({ id: z.string().min(1), purpose: ScenePurposeSchema, actorId: z.string().min(1).optional(), needs: z.array(z.string().min(1)).min(1) })),
    missingRuntimeEvidence: z.array(z.string().min(1))
  })
]);

const CheckSchema = z.object({ id: z.string().min(1), passed: z.boolean(), value: z.union([z.string(), z.number(), z.boolean()]), detail: z.string().min(1).optional(), timestamps: z.array(z.number().nonnegative()).optional() });

export const EditorialReviewSchema = z.object({
  version: z.literal(1), tool: z.literal('watch'), videoPath: z.string().startsWith('/'), videoSha256: z.string().regex(/^[a-f0-9]{64}$/), detail: z.enum(['balanced', 'token-burner']), resolution: z.number().int().positive().optional(),
  transcriptStatus: z.enum(['available', 'not-required', 'unavailable']), score: z.number().min(0).max(10),
  frames: z.object({ distinct: z.number().int().nonnegative(), discarded: z.number().int().nonnegative(), inspected: z.number().int().nonnegative() }),
  assessments: z.object({ hook: z.string().min(1), narrativeContinuity: z.string().min(1), staticSections: z.string().min(1), readability: z.string().min(1), attentionGuidance: z.string().min(1), overlayObstruction: z.string().min(1), transitions: z.string().min(1), audioTreatment: z.string().min(1), outcome: z.string().min(1), closing: z.string().min(1) }),
  defects: z.array(z.object({ timestampSeconds: z.number().nonnegative(), category: z.string().min(1), description: z.string().min(1) })),
  verdict: z.enum(['accept', 'reject']), reviewedAt: z.string().datetime()
});

export const QualityReportSchema = z.object({
  version: z.literal(2), scenarioId: z.string().min(1), status: z.enum(['accepted', 'rejected', 'pending-agent-review']), passed: z.boolean(),
  technical: z.object({ passed: z.boolean(), checks: z.array(CheckSchema) }),
  editorial: z.object({ passed: z.boolean(), checks: z.array(CheckSchema), warnings: z.array(CheckSchema) }),
  agentReview: z.discriminatedUnion('status', [
    z.object({ status: z.literal('not-required'), reason: z.string().min(1) }),
    z.object({ status: z.literal('missing'), reason: z.string().min(1) }),
    z.object({ status: z.literal('complete'), review: EditorialReviewSchema })
  ]),
  sensitiveFindings: z.array(z.object({ kind: z.string(), match: z.string() })),
  omittedScenes: z.array(z.object({ id: z.string(), reason: z.string() })),
  encoding: z.object({ codec: z.string(), width: z.number(), height: z.number(), durationSeconds: z.number(), pixelFormat: z.string() }).optional()
});

const ThresholdSchema = z.object({ distinctWarnRatio: z.number().min(0).max(1), distinctFailRatio: z.number().min(0).max(1), staticWarnSeconds: z.number().positive(), repeatedStaticFailCount: z.number().int().positive(), montageMaxRatio: z.number().min(0).max(1) });
const defaultThreshold = { distinctWarnRatio: 0.5, distinctFailRatio: 0.4, staticWarnSeconds: 3, repeatedStaticFailCount: 2, montageMaxRatio: 0.25 };
const defaultThresholds = { 'public-master': defaultThreshold, 'actor-journey': defaultThreshold, 'feature-clip': defaultThreshold, 'release-demo': defaultThreshold, montage: { ...defaultThreshold, montageMaxRatio: 1 } };

export const ConfigSchema = z.object({
  app: z.object({ url: z.string().url(), startCommand: z.string().optional(), commandCwd: z.string().optional(), healthcheck: z.string().url().optional(), production: z.boolean().default(false) }),
  repository: z.object({ root: z.string().default('.') }).default({ root: '.' }),
  output: z.object({ directory: z.string().default('artifacts') }).default({ directory: 'artifacts' }),
  privacy: z.object({ allowProduction: z.boolean().default(false), scanArtifacts: z.boolean().default(true), redactions: z.array(z.object({ sourceEnv: z.string().min(1), replacement: z.string().min(1) })).default([]) }).default({ allowProduction: false, scanArtifacts: true, redactions: [] }),
  runtime: z.object({ rehearsalPasses: z.number().int().min(2).default(2), headless: z.boolean().default(true), startTimeoutMs: z.number().int().min(1_000).max(600_000).default(60_000), actionTimeoutMs: z.number().int().min(100).max(300_000).default(10_000), ignoreRequestPatterns: z.array(z.string().min(1)).default([]) }).default({ rehearsalPasses: 2, headless: true, startTimeoutMs: 60_000, actionTimeoutMs: 10_000, ignoreRequestPatterns: [] }),
  narration: z.object({
    provider: z.enum(['none', 'elevenlabs', 'macos']).default('none'),
    elevenlabs: z.object({ voiceId: z.string().min(1).optional(), modelId: z.string().min(1).default('eleven_multilingual_v2'), outputFormat: z.string().min(1).default('mp3_44100_128'), apiKeyEnv: z.string().min(1).default('ELEVENLABS_API_KEY') }).default({ modelId: 'eleven_multilingual_v2', outputFormat: 'mp3_44100_128', apiKeyEnv: 'ELEVENLABS_API_KEY' }),
    macos: z.object({ voice: z.string().min(1).default('Samantha') }).default({ voice: 'Samantha' })
  }).default({ provider: 'none', elevenlabs: { modelId: 'eleven_multilingual_v2', outputFormat: 'mp3_44100_128', apiKeyEnv: 'ELEVENLABS_API_KEY' }, macos: { voice: 'Samantha' } }),
  editorial: z.object({ thresholds: z.record(OutputTypeSchema, ThresholdSchema).default(defaultThresholds) }).default({ thresholds: defaultThresholds }),
  devices: z.record(z.string(), z.object({ width: z.number().int().positive(), height: z.number().int().positive(), device: z.string().optional(), isMobile: z.boolean().default(false) })).default({ desktop: { width: 1440, height: 900, isMobile: false }, mobile: { width: 390, height: 844, device: 'iPhone 13', isMobile: true } })
});

export const TimelineEventSchema = z.object({
  sceneId: z.string(), actionIndex: z.number().int().nonnegative(), type: z.string(), label: z.string(), actor: z.string(), startedAtMs: z.number().nonnegative(), endedAtMs: z.number().nonnegative(),
  target: TargetSchema.optional(), box: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).nullable().optional(), state: z.enum(['passed', 'failed', 'omitted'])
});
export const TimelineSchema = z.object({ version: z.literal(2), scenarioId: z.string(), viewport: z.object({ width: z.number(), height: z.number() }), events: z.array(TimelineEventSchema) });
export const ExecutionReportSchema = z.object({
  version: z.literal(2), scenarioId: z.string(), mode: z.enum(['rehearse', 'record']), passed: z.boolean(), consecutivePasses: z.number().int().nonnegative(), startedAt: z.string(), endedAt: z.string(),
  scenarioDigest: z.string(), scenes: z.array(z.object({ id: z.string(), status: z.enum(['passed', 'failed', 'omitted']), failure: z.string().optional() })),
  consoleErrors: z.array(z.string()), executedPath: z.array(z.object({ sceneId: z.string(), actionIndex: z.number().int().nonnegative(), detail: z.string() })).default([]), failedRequests: z.array(z.object({ url: z.string(), status: z.number().optional(), error: z.string().optional() })), ignoredRequests: z.array(z.object({ url: z.string(), status: z.number().optional(), error: z.string().optional() })).default([]), artifacts: z.record(z.string(), z.string())
});

export type Evidence = z.infer<typeof EvidenceSchema>;
export type ProductModel = z.infer<typeof ProductModelSchema>;
export type PlanResult = z.infer<typeof PlanResultSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;
export type DemoConfig = z.infer<typeof ConfigSchema>;
export type Target = z.infer<typeof TargetSchema>;
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;
export type EditorialReview = z.infer<typeof EditorialReviewSchema>;
export type QualityReport = z.infer<typeof QualityReportSchema>;
