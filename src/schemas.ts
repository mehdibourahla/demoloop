import { z } from 'zod';

const EvidenceSchema = z.object({
  path: z.string().min(1),
  line: z.number().int().positive().optional(),
  detail: z.string().optional()
});

const RuntimeEvidenceSchema = z.object({
  url: z.string().url(),
  screenshot: z.string().optional(),
  ariaSnapshot: z.string().optional(),
  observedAt: z.string()
});

export const ProductModelSchema = z.object({
  version: z.literal(1),
  product: z.string().min(1),
  roles: z.array(z.object({ id: z.string(), name: z.string(), evidence: z.array(EvidenceSchema).default([]) })),
  routes: z.array(z.object({ path: z.string(), role: z.string().optional(), evidence: z.array(EvidenceSchema).default([]), runtimeEvidence: z.array(RuntimeEvidenceSchema).default([]) })),
  features: z.array(z.object({
    id: z.string(), name: z.string(), demoReady: z.boolean().default(false), userConfirmed: z.boolean().default(false),
    sourceEvidence: z.array(EvidenceSchema).min(1), runtimeEvidence: z.array(RuntimeEvidenceSchema).default([])
  }).superRefine((feature, context) => {
    if (feature.demoReady && !feature.userConfirmed && feature.runtimeEvidence.length === 0) {
      context.addIssue({ code: 'custom', message: 'demo-ready features require runtime evidence or user confirmation' });
    }
  })),
  journeys: z.array(z.object({ id: z.string(), name: z.string(), actors: z.array(z.string()), features: z.array(z.string()), demoReady: z.boolean() }))
});

export const TargetSchema = z.discriminatedUnion('by', [
  z.object({ by: z.literal('role'), role: z.enum(['button', 'link', 'textbox', 'checkbox', 'radio', 'heading', 'combobox']), value: z.string() }),
  z.object({ by: z.literal('label'), value: z.string() }),
  z.object({ by: z.literal('testId'), value: z.string() }),
  z.object({ by: z.literal('text'), value: z.string() })
]);

export const ActionTimingSchema = z.object({
  cursorDurationMs: z.number().int().min(100).max(2_500).optional(),
  settleBeforeMs: z.number().int().min(0).max(1_500).optional(),
  keystrokeDelayMs: z.number().int().min(0).max(250).optional(),
  pauseAfterMs: z.number().int().min(0).max(5_000).optional()
});
const ActionBase = z.object({ title: z.string().optional(), narration: z.string().optional(), annotation: z.string().optional(), pauseAfterMs: z.number().nonnegative().optional(), timing: ActionTimingSchema.optional() });
export const ActionSchema = z.discriminatedUnion('type', [
  ActionBase.extend({ type: z.literal('goto'), path: z.string() }),
  ActionBase.extend({ type: z.literal('click'), target: TargetSchema }),
  ActionBase.extend({ type: z.literal('fill'), target: TargetSchema, text: z.string() }),
  ActionBase.extend({ type: z.literal('select'), target: TargetSchema, value: z.string() }),
  ActionBase.extend({ type: z.literal('scroll'), target: TargetSchema.optional(), deltaY: z.number().optional() }),
  ActionBase.extend({ type: z.literal('assert'), target: TargetSchema, state: z.enum(['visible', 'hidden', 'checked']), text: z.string().optional() }),
  ActionBase.extend({ type: z.literal('screenshot'), name: z.string() })
]);

export const ScenarioSchema = z.object({
  version: z.literal(1), id: z.string().regex(/^[a-z0-9-]+$/), title: z.string().min(1),
  audience: z.string().default('general'), locale: z.string().default('en'), duration: z.string().optional(), narration: z.enum(['none', 'captions', 'voiceover']).default('none'),
  branding: z.object({ name: z.string().default('Product Demo'), primary: z.string().default('#2563eb'), background: z.string().default('#08111f') }).default({ name: 'Product Demo', primary: '#2563eb', background: '#08111f' }),
  preconditions: z.object({ resetCommand: z.string().optional(), seedCommand: z.string().optional() }).default({}),
  actors: z.array(z.object({ id: z.string(), role: z.string(), storageState: z.string().optional() })).min(1),
  scenes: z.array(z.object({ id: z.string(), title: z.string(), description: z.string().optional(), actor: z.string(), actions: z.array(ActionSchema).min(1) })).min(1)
}).superRefine((scenario, context) => {
  const actors = new Set(scenario.actors.map((actor) => actor.id));
  scenario.scenes.forEach((scene, index) => {
    if (!actors.has(scene.actor)) context.addIssue({ code: 'custom', path: ['scenes', index, 'actor'], message: 'scene actor must be declared' });
  });
});

export const ConfigSchema = z.object({
  app: z.object({ url: z.string().url(), startCommand: z.string().optional(), commandCwd: z.string().optional(), healthcheck: z.string().url().optional(), production: z.boolean().default(false) }),
  repository: z.object({ root: z.string().default('.') }).default({ root: '.' }),
  output: z.object({ directory: z.string().default('artifacts') }).default({ directory: 'artifacts' }),
  privacy: z.object({
    syntheticData: z.boolean().default(true),
    allowProduction: z.boolean().default(false),
    scanArtifacts: z.boolean().default(true),
    redactions: z.array(z.object({ sourceEnv: z.string().min(1), replacement: z.string().min(1) })).default([])
  }).default({ syntheticData: true, allowProduction: false, scanArtifacts: true, redactions: [] }),
  runtime: z.object({ rehearsalPasses: z.number().int().min(2).default(2), headless: z.boolean().default(true) }).default({ rehearsalPasses: 2, headless: true }),
  narration: z.object({
    provider: z.enum(['none', 'elevenlabs', 'macos']).default('none'),
    elevenlabs: z.object({
      voiceId: z.string().min(1).optional(), modelId: z.string().min(1).default('eleven_multilingual_v2'),
      outputFormat: z.string().min(1).default('mp3_44100_128'), apiKeyEnv: z.string().min(1).default('ELEVENLABS_API_KEY')
    }).default({ modelId: 'eleven_multilingual_v2', outputFormat: 'mp3_44100_128', apiKeyEnv: 'ELEVENLABS_API_KEY' }),
    macos: z.object({ voice: z.string().min(1).default('Samantha') }).default({ voice: 'Samantha' })
  }).default({ provider: 'none', elevenlabs: { modelId: 'eleven_multilingual_v2', outputFormat: 'mp3_44100_128', apiKeyEnv: 'ELEVENLABS_API_KEY' }, macos: { voice: 'Samantha' } }),
  upload: z.object({ enabled: z.boolean().default(false) }).default({ enabled: false }),
  devices: z.record(z.string(), z.object({ width: z.number().int().positive(), height: z.number().int().positive(), device: z.string().optional(), isMobile: z.boolean().default(false) })).default({
    desktop: { width: 1440, height: 900, isMobile: false }, mobile: { width: 390, height: 844, device: 'iPhone 13', isMobile: true }
  })
});

export const TimelineEventSchema = z.object({
  sceneId: z.string(), actionIndex: z.number().int().nonnegative(), type: z.string(), label: z.string(), actor: z.string(), startedAtMs: z.number().nonnegative(), endedAtMs: z.number().nonnegative(),
  target: TargetSchema.optional(), box: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).nullable().optional(), state: z.enum(['passed', 'failed', 'omitted'])
});

export const TimelineSchema = z.object({ version: z.literal(1), scenarioId: z.string(), viewport: z.object({ width: z.number(), height: z.number() }), events: z.array(TimelineEventSchema) });

export const ExecutionReportSchema = z.object({
  version: z.literal(1), scenarioId: z.string(), mode: z.enum(['rehearse', 'record']), passed: z.boolean(), consecutivePasses: z.number().int().nonnegative(), startedAt: z.string(), endedAt: z.string(),
  scenarioDigest: z.string(), scenes: z.array(z.object({ id: z.string(), status: z.enum(['passed', 'failed', 'omitted']), failure: z.string().optional() })),
  consoleErrors: z.array(z.string()), failedRequests: z.array(z.object({ url: z.string(), status: z.number().optional(), error: z.string().optional() })), artifacts: z.record(z.string(), z.string())
});

export const QualityReportSchema = z.object({
  version: z.literal(1), scenarioId: z.string(), passed: z.boolean(), checks: z.array(z.object({ id: z.string(), passed: z.boolean(), value: z.union([z.string(), z.number(), z.boolean()]), detail: z.string().optional() })),
  sensitiveFindings: z.array(z.object({ kind: z.string(), match: z.string() })), omittedScenes: z.array(z.object({ id: z.string(), reason: z.string() })), encoding: z.object({ codec: z.string(), width: z.number(), height: z.number(), durationSeconds: z.number(), pixelFormat: z.string() }).optional()
});

export type ProductModel = z.infer<typeof ProductModelSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;
export type DemoConfig = z.infer<typeof ConfigSchema>;
export type Target = z.infer<typeof TargetSchema>;
export type Action = z.infer<typeof ActionSchema>;
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;
